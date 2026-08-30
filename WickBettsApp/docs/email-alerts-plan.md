# Email alerts — fix plan

## Status

Plan only — no code or infrastructure changed yet. This document exists so we can agree on the sending identity and the remediation steps before touching production.

## The short version

The "email a member every time we post a new alert" feature is already fully built — it isn't a missing feature, it's a missing production credential. I checked the live Railway service (`WickBettsAPP`, production) and confirmed `RESEND_API_KEY` is not set. The alert-email code (`fanOutSignalEmail` / `fanOutNewsEmail` in `emailNotifications.ts`) checks for that key before sending anything, and when it's absent it logs a warning and quietly does nothing instead of failing loudly — so every alert email has been silently skipped since this shipped, with no visible error anywhere. That's why alerts feel broken even though the code that fires them is correct.

Separately, you want the "From" identity to be `support@seaubank.com`, your Google Workspace mailbox, rather than the placeholder `alerts@wickbetts.app` the code currently falls back to. That's a real decision with a right answer that isn't "just point it at Workspace," explained below.

## What's already built (confirmed by reading the code, not assumed)

Every time an admin publishes a signal, or the automated scanner promotes one from Watching to Active, the API already fans it out on two channels: an Expo push notification to anyone with a registered device token, and an email via Resend's HTTP API to every subscribed member with email alerts turned on. News alerts flagged on a signal get their own email the same way. Both channels are gated by the same two per-user toggles — "New signals" and "Major news," each labeled "push + email" — which live in Profile → Notifications, default to sensible values (signals on, news off), and already persist to the same database columns both fan-out functions read. None of that needs to be built. The only reason nothing has arrived in anyone's inbox is the missing API key.

## Root cause, confirmed

`isConfigured()` in `emailNotifications.ts` returns `true` only when `process.env.RESEND_API_KEY` is set. Railway's variable list for the production `WickBettsAPP` service does not include it — nor does it include a custom `EMAIL_FROM`, so if a key were added today, alerts would still go out from the placeholder `alerts@wickbetts.app`, a domain nothing has ever verified with an email provider (mail from an unverified domain gets rejected or buried in spam almost universally). Fixing delivery is two settings away, not a development project: add the key, and point `EMAIL_FROM` at a verified `support@seaubank.com`.

## The sending-identity decision: keep Resend, verify seaubank.com — don't route through Workspace SMTP directly

There are two real ways to make alert emails show up as coming from `support@seaubank.com`, and they're not equivalent.

**Recommended: verify `seaubank.com` with Resend, keep the existing code.** Resend (or any transactional email provider) lets you prove you own a domain by adding a few DNS records — an SPF entry, a DKIM key, optionally DMARC — at wherever `seaubank.com`'s DNS is managed. Once verified, the existing `fanOutSignalEmail`/`fanOutNewsEmail` code can send with `EMAIL_FROM="Wick Betts Alerts <support@seaubank.com>"` and nothing else changes — recipients see `support@seaubank.com` as the sender, replies land in that real Workspace mailbox if we also set a reply-to, and the send still goes through Resend's infrastructure, which is built for exactly this: automated, per-event, potentially-bursty transactional mail, with the retry/batching/logging this codebase already has wired up. This costs zero new code and zero new dependencies.

**Not recommended for this use case: sending directly through Google Workspace's SMTP relay or the Gmail API.** This would technically also show `support@seaubank.com` as the sender, but it's the wrong tool for "email every subscribed member every time we post an alert," for a few concrete reasons. Workspace's SMTP relay service is designed to relay outbound mail from your own on-prem mail server, not to be a bulk-alert API — it caps around 10,000 messages per day per licensed user and requires allow-listing the sending server's IP address in the Workspace Admin console, which is a real problem on Railway specifically, since Railway's outbound IP isn't static on a standard plan and can change on redeploy, silently breaking delivery again later. Plain Gmail SMTP with an app password is worse — around 500 recipients/day and explicitly not intended for automated app-based sending; Google's abuse detection can lock the account. And code-wise, a real SMTP client means adding a dependency like `nodemailer`, which reopens the exact problem this codebase's own `docs/adr/0005` already solved by choosing a raw `fetch` call to Resend instead: the Docker build only ships the already-locked `node_modules`, so any new dependency needs a working local `pnpm install` to regenerate the lockfile before it can even be built. Workspace SMTP is a real mailbox for people to write to and receive from — it's not built to be an alerting service's delivery engine, and pointing this feature at it directly would trade a one-time DNS-verification step for an ongoing operational risk that tends to resurface at the worst time (a burst of signals on a volatile trading day being exactly when Workspace's rate limit would kick in).

The practical middle ground gets you what you actually want either way: alerts are sent by Resend, branded and reply-able as `support@seaubank.com`, while the real Workspace inbox stays exactly what people write back to.

## Remediation steps

1. Create (or use an existing) Resend account under the SEAU org, and start domain verification for `seaubank.com` (or a dedicated subdomain like `mail.seaubank.com`, if you'd rather not touch the root domain's DNS — either works, a subdomain is slightly safer since it can't affect Workspace's own mail flow if a record is ever fat-fingered).
2. Add the DNS records Resend generates (SPF TXT, DKIM CNAME/TXT, optional DMARC) at whichever registrar or DNS host actually manages `seaubank.com` today. If Workspace already publishes its own SPF record for the domain, that record needs to be *merged* with Resend's SPF entry into one combined TXT record rather than replaced — two separate SPF TXT records on the same domain is invalid and breaks deliverability for both senders. This is the one step that needs someone with real access to the domain's DNS zone; I can't do it from here.
3. Once Resend shows the domain verified, generate an API key scoped to sending.
4. Set two variables on the `WickBettsAPP` production service in Railway: `RESEND_API_KEY` (the key from step 3) and `EMAIL_FROM` (something like `Wick Betts Alerts <support@seaubank.com>`). I already have Railway access for this project and can set both the moment you hand me the key — no redeploy of app code is needed for either the fix or the sender change, since both are read from `process.env` at send time.
5. Send one real test alert (easiest is publishing a small test signal from the admin signal studio) and confirm it lands in a real inbox, not spam — a free check with a tool like mail-tester.com right after step 4 is the fastest way to catch a missed DNS record before real members see it.
6. Add a reply-to header pointing at `support@seaubank.com` alongside the from-name change (a small code change to `emailNotifications.ts`, bundled with the sender switch rather than done separately), so a member who hits "reply" on an alert reaches the real support inbox instead of a dead address.
7. Add a one-line unsubscribe/manage-preferences link into the email template itself, pointing back at the in-app Profile → Notifications screen. The toggle to stop these already exists in the app, but a compliance-minded bulk sender should also offer a way out from inside the email — this is a small addition to the existing `wrapHtml()` template, not new infrastructure.

## What I need from you before any of this can go live

The Resend account and the DNS access are both things only you (or whoever holds the `seaubank.com` registrar/Workspace admin login) can do — I don't have a path to either from here. Once you've got a verified domain and an API key in hand, tell me and I'll set the two Railway variables and ship the small reply-to/unsubscribe code change in the same pass, then we can send a live test together.
