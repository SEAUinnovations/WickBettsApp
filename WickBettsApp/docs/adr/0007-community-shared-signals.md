# 0007: Member-shared signals + follow, scoped to Community only

## Status

Accepted.

## Context

Members asked to be able to share their own trade ideas and follow other
members to see what they're trading, with the explicit constraint that
shared signals must never show up outside the Community tab — the paid
`/signals` feed is Wick-curated content members are paying for, and mixing
in arbitrary member posts would dilute that and create a quality/liability
mismatch (the admin feed carries Greeks, review workflow, and an implicit
"Wick reviewed this" trust signal that a casual member post shouldn't
borrow).

Two product questions needed resolving before building: what "follow"
means, and how much structure a shared signal should carry. Both were
decided explicitly rather than assumed:

- **Follow = follow a person**, not a per-signal bookmark. Following an
  author surfaces all of their future shared signals in a personalized
  feed — closer to following someone on social media than watchlisting an
  individual trade.
- **Lean structured form**: ticker, market, direction, entry, target,
  optional stop, and a short thesis note. Deliberately no options
  contract/Greeks/IV fields — that level of detail is Wick's curated-signal
  differentiator, not something to ask a casual poster to fill in
  accurately.

## Decision

New tables (`community_signals`, `member_follows`; migration 0011) and
routes under `/api/community/*` (`GET/POST /signals`, `PATCH/DELETE
/signals/:id`, `POST /follow/:userId` as a toggle, mirroring the existing
reaction-toggle pattern in the same file) — kept in `routes/community.ts`
rather than a new router file, since it shares the same subscription-gate
helper and profanity filter already in that module.

Notably, these new endpoints use `requireAuth` only, NOT the
`requireActiveSubscription` guard also defined in that file. That guard
turned out to be defined but never wired into any of the existing
community endpoints (chat posts, reactions) — the dashboard's own copy
("catch up in Community while you decide") confirms Community access is
intentionally free-tier, unlike Signals/News. Gating signal-sharing behind
a subscription while chat stayed free would have been an inconsistent,
unrequested change, so shared signals/follow match the existing free
access level instead.

Status tracking is a simple author-toggled Open/Closed (not the 4-state
admin signal status, which involves an approval workflow that doesn't
apply to member posts) — no admin review step; any subscriber-tier
restriction may be revisited later, but that's a product call not implied
by the current ask.

Mobile: added as a fifth Community tab ("Shared Signals"), not folded into
the existing text-only "Signals" discussion thread — that thread is
freeform chat, this is structured, filterable, follow-able data, closer in
shape to the Trade Review tab (its own feed + composer) than to a chat
thread.

## Consequences

- `community_signals` has no retention purge (unlike `community_posts`'s
  30-day rolling window) — shared signals are closer to a lightweight
  track record than chat noise, so they persist until the author closes
  or deletes them, or an admin removes one.
- Discovery is solved by defaulting the feed to "All" (every member's
  shared signals) with a "Following" filter layered on top, rather than
  defaulting to Following-only — a new member with nobody followed yet
  would otherwise see an empty tab with no path to find people to follow.
- No email/push notification wired up for "someone you follow shared a new
  signal" — the feed is pull-based (visit the tab, see what's new). Adding
  a notification would reuse the `utils/emailNotifications.ts` pattern
  from ADR 0006 if this becomes a common request later.
