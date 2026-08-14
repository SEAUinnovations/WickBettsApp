# 0006: Email as a second notification channel (Resend, raw fetch)

## Status

Accepted.

## Context

Push notifications (Expo) have two real gaps: the web build has no service
worker registered, so it can never receive a push at all, and mobile tokens
can silently go stale (uninstall, OS-level permission revoked mid-session,
token rotation) with no user-visible signal that alerts have stopped. Both
gaps meant `notifySignals`/`notifyNews` being "on" in a member's settings
did not reliably mean they'd hear about a new signal or a flagged news
event.

The mobile Settings screen also had a real bug that made this worse: every
toggle in the Notifications section was gated behind
`confirmPushDeliverable()`, which returned `false` — refusing to save the
preference at all — if the OS push permission had been denied. A member who
declined the push prompt once could never turn signal/news alerts back on
for *any* channel, even though nothing about email delivery depends on a
push token.

## Decision

Add email as an equal, independent delivery channel reusing the existing
`notifySignals`/`notifyNews` boolean columns on `users` rather than adding
new preference columns — a member has one set of alert preferences, and
those preferences now drive both channels rather than push exclusively.
`utils/emailNotifications.ts` mirrors the shape of `utils/pushNotifications.ts`
(`fanOutSignalEmail`, `fanOutNewsEmail`, fire-and-forget, never throws) and
sends through Resend's plain HTTP API via `fetch` — no `resend` npm
dependency, consistent with ADR 0005's raw-fetch pattern for anything that
would otherwise need a fresh `pnpm install` to lock.

Trigger points:

- `POST /api/signals` (manual publish) — fires push + email immediately, as
  it always has for push.
- `PATCH /api/signals/:id` — fires push + email only on the transition INTO
  `status: "Active"`. Auto-generated signals land as `"Watching"` from
  `signalScanner.ts` and were never notification-worthy in that state (an
  admin hasn't reviewed them yet — see the existing DELETE route comment
  about discarding auto signals nobody wants to run with); this is the
  first point an auto-generated signal becomes a live call, and it also
  covers an admin re-activating a manually edited one.
- Same `PATCH` transition additionally fires `fanOutNewsEmail` (gated on
  `notifyNews`, separate from `notifySignals`) when the signal carries
  `newsAlert: true` from the scanner's earnings-calendar proximity check.

The mobile Settings bug is fixed alongside this: `confirmPushDeliverable`
no longer blocks saving a preference on a denied/unsupported push result —
it only surfaces an informational alert ("you'll still get email alerts").
Toggle labels were updated to say "push + email" so the UI doesn't imply a
push-only mechanism.

## Consequences

- Without `RESEND_API_KEY` configured, email sends are skipped with a
  logged warning — same graceful-degradation shape as `OPENAI_API_KEY`
  missing for Review My Trade. Not yet configured in production as of this
  writing.
- Auto-generated ("Watching") signals still do not notify anyone on
  insert — only on admin promotion to "Active". If the intent is ever for
  fully-automated signals to notify without a human step, that's a
  deliberate policy change, not a bug in this implementation.
- Email content is duplicated per recipient at send time (Resend batch
  endpoint, ≤100 per call, chunked the same way push chunks at 100). No
  unsubscribe link is included yet — toggling off in Settings is the only
  opt-out path. Revisit if this needs to satisfy CAN-SPAM/GDPR unsubscribe
  requirements before a wider rollout.
