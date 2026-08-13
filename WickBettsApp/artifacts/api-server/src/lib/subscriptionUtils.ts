import type { Subscription } from "./db.js";

const ENTITLING_STATUSES = new Set(["active", "trialing"]);
const GRACE_PERIOD_DAYS = 5;

function isEntitled(sub: Subscription, now: Date): boolean {
  if (ENTITLING_STATUSES.has(sub.status)) return true;
  if (sub.status === "past_due" && sub.currentPeriodEnd) {
    const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    return new Date(sub.currentPeriodEnd) >= graceCutoff;
  }
  return false;
}

/**
 * Given all of a user's subscription rows, pick the single most relevant one
 * to display as "their subscription".
 *
 * Why this is needed: a member can accumulate multiple subscription rows over
 * time — re-subscribing after a cancellation, switching plans, or a delayed
 * webhook creating a second row — and each Stripe subscription gets its own
 * row keyed by stripeSubscriptionId. Reading with `.limit(1)` and no ORDER BY
 * returns whichever row Postgres happens to return first, which can surface a
 * stale canceled subscription even though the member has a brand-new active
 * one from a purchase made minutes ago. That is the "my purchase didn't go
 * through" bug reported by users whose checkout actually succeeded.
 *
 * Priority: any currently-entitling subscription (active/trialing/grace
 * past_due) wins, tie-broken by most recently updated. Falls back to the most
 * recently updated row overall if none are currently entitling, so a lapsed
 * member still sees their most recent plan/status rather than a random one.
 */
export function pickPrimarySubscription(subs: Subscription[]): Subscription | null {
  if (subs.length === 0) return null;
  const now = new Date();
  const sorted = [...subs].sort((a, b) => {
    const aEntitled = isEntitled(a, now) ? 1 : 0;
    const bEntitled = isEntitled(b, now) ? 1 : 0;
    if (aEntitled !== bEntitled) return bEntitled - aEntitled;
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
  return sorted[0] ?? null;
}
