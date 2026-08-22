# Wick Betts — App Store Launch Plan

Scope: **iOS first**, Android deferred to a later round (see "Why iOS first" below). This plan sequences everything between today and a live App Store listing. It doesn't repeat command-level detail already written up in `docs/app-store-submission-guide.md` — it tells you what order to do things in and what's already done versus still open, based on the current state of the repo as of 2026-08-21.

## Where things already stand

The mobile app isn't a from-scratch build — it's an existing Expo (React Native) app at `artifacts/wick-betts-mobile`, already wired to the live production API and already has EAS build/submit config started. Specifically, already done:

- Expo SDK 54 app with native iOS/Android targets plus a web export (`wickbetts.com`), sharing one codebase.
- `eas.json` build profiles (development/preview/production) point at the real production API and ship the live Clerk key.
- `app.json` has iOS permission strings for the photo library/camera (needed for Review My Trade and avatar upload), an Android adaptive icon, and `ITSAppUsesNonExemptEncryption: false` set.
- App icon at `assets/images/icon.png` is 1024×1024 RGB with **no alpha channel** — verified directly, this passes Apple's icon requirement as-is. No work needed here.
- A legal/disclosures screen (`app/legal.tsx`) already carries the "not investment advice" disclaimer and billing/refund terms — this is exactly what Apple's reviewers check for on financial apps.
- A full submission walkthrough already exists at `docs/app-store-submission-guide.md`, written for this exact repo — use it for the literal `eas build`/`eas submit` commands once you reach that step.

## Why iOS first

Apple changed Guideline 3.1.3 in May 2025: apps on the **US storefront** can now link out to an external payment flow (your existing Stripe Checkout) without needing a parallel Apple In-App Purchase system. Your current billing setup should work with no rework, for a US-only launch.

Google Play has no equivalent carve-out. Purchases of digital content/subscriptions generally have to go through Google Play Billing, or the app has to qualify as a "multi-platform service" under Play's policy — either path is real engineering work (a second payment integration, or a policy-compliant restructure) that's worth scoping separately rather than blocking the iOS launch on it.

## Decisions only you can make (do these first)

1. **Bundle identifier.** `app.json` currently has `com.wickbetts.app` as a placeholder in both `ios.bundleIdentifier` and `android.package`. iOS lets you change this before your first TestFlight build but not after release without creating a new app record; Android's package name can never change once published. Confirm `com.wickbetts.app` or pick the real one now.
2. **Apple Developer Program enrollment** ($99/year) — needed before any of the account-setup steps below can happen. If you haven't already enrolled, this is the long-pole item to start immediately since Apple's identity verification can take a few days.
3. **Expo/EAS account** to build and submit from — free to create, but someone needs to own it (`eas login` / `eas init` fills in the real `extra.eas.projectId` and `owner` fields in `app.json`, both still placeholders).

## Phase 1 — Code fixes before the first build

None of these are done yet. All are small, and none require the account decisions above, so they can happen in parallel with enrollment:

- **Sign in with Apple.** The login screen (`app/login.tsx`) currently offers only "Continue with Google" as a sign-in method (email/password exists separately on the sign-up screen, but Google is the only social option shown). Apple's Guideline 4.8 requires Sign in with Apple as an equivalent option whenever a third-party/social login is offered — this is a near-automatic rejection if skipped, not a maybe. Clerk supports Apple as an SSO strategy the same way Google is wired up now, so this is additive, not a rewrite.
- **Privacy policy page.** No dedicated `/privacy` route exists in the mobile app, and `app/legal.tsx` covers disclosures/billing terms but not a privacy policy. Both App Store Connect and Google Play Console require a privacy policy URL at submission — this needs to exist and be reachable (either in-app or on wickbetts.com) before you can fill out either console's listing form.
- **Remove the unused `expo-location` dependency**, or configure it properly. It's listed in `package.json` but nothing in the app imports it — an unused permission-requiring package can fail an EAS build depending on how the native config plugin resolves it. Cheapest fix is just removing it (`pnpm remove expo-location`) unless you're planning to use location for something soon, in which case add the iOS usage-string instead.
- **App Privacy "nutrition label."** Not code, but decide it now so App Store Connect's form isn't a scramble later. Based on what the app actually does: email + name (Clerk), payment info (handled by Stripe — your backend never touches card numbers), uploaded images (trade screenshots, avatars), and push tokens. Have this list ready when you reach the Connect listing form.
- **Demo access for App Review.** The whole app sits behind Clerk auth plus a paid subscription gate, and reviewers cannot pay through Stripe to unlock signals/community content themselves. You'll need to either grant a demo account an active subscription server-side (via the admin panel) or write review notes explaining which screens require a paid plan and what they'd show. Decide which approach before submission — it's a common rejection reason when skipped.

## Phase 2 — Store setup (after Apple enrollment clears)

1. Install EAS CLI and log in: `npm install -g eas-cli`, then from `artifacts/wick-betts-mobile`, `eas login` and `eas init` (fills the placeholders in `app.json`).
2. Register the bundle ID as an App ID in the Apple Developer portal (or let `eas build` do it automatically on first run).
3. Create the app record in App Store Connect (name, primary language, bundle ID, SKU) — this shell record needs to exist before `eas submit` can push into it.
4. Fill in `eas.json`'s `submit.production.ios` placeholders: `appleId`, `ascAppId`, `appleTeamId`.

## Phase 3 — Build & internal test

```
cd artifacts/wick-betts-mobile
eas build --platform ios --profile preview     # TestFlight-only, not submitted to review
```

Install on a real device via TestFlight and walk through sign-up, sign-in, checkout redirect, and the paid-gated screens end to end before spending a production build on it.

## Phase 4 — Store listing & submission

While the preview build is being tested, prepare the App Store Connect listing in parallel — this is the part with no repo dependency and is easy to underestimate on time:

- Screenshots (per required device size — Connect will list which sizes it needs).
- App description, keywords, support URL, marketing URL.
- Age rating questionnaire.
- Privacy policy URL (from Phase 1) and the App Privacy nutrition label answers.
- A short note in App Review Information pointing to demo credentials and explaining the subscription gate.

Then:

```
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

This uploads the binary; you then go into App Store Connect to attach it to the listing you built above and press **Submit for Review**.

## Rough timeline

| Stage | Time |
|---|---|
| Apple Developer enrollment (identity verification) | 1–3 days, start immediately |
| Phase 1 code fixes (Sign in with Apple, privacy page, cleanup) | 2–4 days |
| Phase 2 account/store setup | a few hours, once enrollment clears |
| Phase 3 TestFlight build + internal testing | 2–3 days |
| Phase 4 listing prep (can overlap with Phase 3) | 2–3 days |
| Apple review | typically 1–3 days, can be longer |

Realistic total: **2–3 weeks** from today to a live listing, assuming Apple enrollment isn't delayed and the first review pass doesn't bounce back with a rejection to fix.

## Android (Google Play) — deferred, scoped separately

Not part of this pass. When you're ready to revisit it, the open question to resolve first is which path to take on Play's Payments Policy: full Google Play Billing integration for the four paid tiers, or restructuring around Play's "multi-platform service" allowance (available when the service is also usable outside the app, with conditions). That decision drives real engineering scope, so it deserves its own planning pass rather than being folded into the iOS launch. `eas.json` already has an Android `preview` build profile and a `submit.production.android` block scaffolded for whenever that happens.

## Reference

- `docs/app-store-submission-guide.md` — command-level walkthrough for this exact repo, written alongside the current `app.json`/`eas.json` config.
- `docs/adr/0003-trade-review-ai-provider.md` — how uploaded trade screenshots are handled (relevant to the App Privacy label).
- `docs/adr/0004-security-hardening.md` — current security posture, useful if a reviewer asks about it.
