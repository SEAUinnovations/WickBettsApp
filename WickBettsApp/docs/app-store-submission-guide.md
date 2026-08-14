# App Store & Google Play submission guide

This covers what's already configured in the repo, what you still need to
decide/verify before the first build, and the exact commands to build and
submit. It's written for `artifacts/wick-betts-mobile` (Expo SDK 54, EAS
Build/Submit). I can't run `eas login`, register an Apple Developer account,
pay Apple/Google's fees, or hold your credentials — those steps are yours to
run locally with the Expo CLI. Everything I could configure ahead of time is
already committed.

## 1. The one compliance question that matters most

Wick Betts sells subscriptions (signals, mentorship, membership) and one-off
purchases (extra trade review credits) through **Stripe Checkout**, opened
in-app via `expo-web-browser`. Apple's rule against linking to external
payment for digital content/subscriptions (Guideline 3.1.1/3.1.3) used to
make this a near-automatic rejection unless you built a parallel
Apple In-App Purchase flow.

That changed: as of a May 2025 update (following a US court order), Apple's
Guideline 3.1.3 **no longer prohibits linking to an external purchase method
for apps on the US App Store storefront**, and apps don't need a special
entitlement to include those buttons/links — this used to be limited to
"reader" apps only, and now applies more broadly for the US storefront.

Practically, for a US-only launch:

- Keep the existing Stripe flow. `components/Billing.tsx` already says
  "Secure checkout opens in Stripe" next to every purchase button, which is
  good practice — being upfront that checkout leaves the app is one of the
  few things reviewers still explicitly look for.
- If you ever distribute outside the US (other country storefronts), the
  old restriction still applies there — you'd need a `3.1.3(a)` "reader app"
  fit (content already purchased elsewhere — no purchase buttons at all in
  the app for that storefront) or a full Apple IAP implementation.
- This is app-review policy, which Apple can and does revise. Verify current
  guideline text at [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/)
  before you submit, since I can't guarantee this hasn't shifted again by
  the time you build.

Google Play has a comparable Payments Policy requiring Play Billing for
purchases of "digital content" consumed inside the app, without an
equivalent US-specific carve-out as of this writing. If you plan an Android
release, budget time to review [Play's Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
separately — it may require either Google Play Billing for the four paid
tiers, or restructuring the Android build as a Play-compliant "multi-platform"
service (Play does allow this for services also usable outside the app, with
conditions). This guide focuses on the iOS path first since that's the
lower-risk one given the current rules.

**Financial-content review note:** Apple's guidelines flag apps offering
trading/investing services for extra scrutiny — expect reviewers to check
for a clear "not investment advice" disclaimer and, in some cases, ask about
licensing. `app/legal.tsx` already carries that disclaimer ("Wick Betts is
educational market intelligence. It is not investment advice..."); make sure
it's reachable from the app (Settings → legal) and consider repeating a short
version of it in the App Store Connect app description, since reviewers
sometimes check the listing copy too, not just the binary.

## 2. What's already configured in this repo

- `artifacts/wick-betts-mobile/app.json`: added `ios.bundleIdentifier` /
  `android.package` (placeholder `com.wickbetts.app` — **confirm or change
  this**, see step 3), `ios.buildNumber` / `android.versionCode`, an
  `expo-image-picker` plugin entry with iOS permission strings (needed
  because Review My Trade and avatar upload both use the photo library /
  camera — without these strings the app crashes on first picker use on iOS
  instead of just failing a lint), an Android adaptive icon block, and an
  `extra.eas.projectId` placeholder.
- `artifacts/wick-betts-mobile/eas.json`: build profiles (`development`,
  `preview`, `production`) now point `EXPO_PUBLIC_API_URL` at the real
  production API (`https://wickbettsapp-production.up.railway.app` — the
  same Railway origin `public/_worker.js` proxies web traffic to) instead of
  the placeholder `app.example.com`, and set the live Clerk publishable key
  (safe to commit — publishable keys are meant to be public, and this one
  already ships in `.env.production` for the web build). A `submit.production`
  block has placeholder fields for Apple/Google credentials (step 4).
- `docs/adr/0006-email-notifications.md` and everything from the
  notifications work is unrelated to this but shipped in the same session,
  noted here only so the ADR list makes sense if you're reading them in
  order.

## 3. Before your first build — decide these

1. **Bundle identifier / package name.** `com.wickbetts.app` is a
   placeholder in both `app.json` fields (`ios.bundleIdentifier`,
   `android.package`). Pick the real one now — iOS lets you change it before
   your first TestFlight build but not after App Store release without
   creating a new app record; Android's `package` can **never** change once
   published. Update both fields together if you change it.
2. **App icon.** `assets/images/icon.png` is the only icon asset in the
   repo, reused for splash, favicon, and (now) the Android adaptive icon
   foreground. Apple wants a 1024×1024 PNG with no alpha channel/transparency
   for the App Store listing icon specifically — verify the current file
   meets that before building, since a transparent icon is a common instant
   rejection.
3. **`expo-location` is an unused dependency.** It's listed in
   `package.json` but nothing in the codebase imports it. Some native config
   plugins fail an EAS build if a permission-requiring package is present
   without its Info.plist usage string configured. Either remove the
   dependency (`pnpm remove expo-location` from `artifacts/wick-betts-mobile`
   — needs a real `pnpm install` after) if it's dead weight, or add an
   `NSLocationWhenInUseUsageDescription` to `ios.infoPlist` in `app.json` if
   you're keeping it for future use. I didn't change this myself since I
   couldn't run a build to confirm which path avoids a failure.
4. **Privacy policy URL.** Both App Store Connect and Google Play Console
   require one at submission. Check whether `wickbetts.com` already has a
   `/privacy` page — `app/legal.tsx` covers Terms/disclaimer copy but I
   didn't find a dedicated privacy policy route in this codebase. You'll
   need a URL to paste into both consoles' listing forms regardless of what
   the app itself links to.
5. **App Privacy "nutrition label" (Apple) / Data safety form (Google).**
   Both stores now require you to declare what data you collect. Based on
   what this app actually does: email + name (Clerk auth), payment info
   (handled entirely by Stripe — Wick Betts's own backend never touches card
   numbers), uploaded images (trade review chart screenshots, profile
   avatars — stored as data URLs / uploaded files, see
   `docs/adr/0003-trade-review-ai-provider.md` for how those are handled),
   and push tokens. Fill these forms out from that list — I can't submit
   them on your behalf since they're entered directly in each store's
   console.

## 4. One-time account setup (yours to do — I can't hold these credentials)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year) if you haven't.
2. Create a [Google Play Console](https://play.google.com/console) account ($25 one-time) if targeting Android.
3. Install the EAS CLI and log in from your machine:
   ```
   npm install -g eas-cli
   cd artifacts/wick-betts-mobile
   eas login
   ```
4. Link this project to your Expo account (this fills in the real
   `extra.eas.projectId` in `app.json` and `owner` field, replacing the two
   placeholders I left):
   ```
   eas init
   ```
5. Register the bundle ID / package name you settled on in step 3 above:
   - iOS: create the App ID under **Certificates, Identifiers & Profiles**
     in the Apple Developer portal (or let `eas build` do it automatically
     on first run — it will prompt).
   - Android: the package name is claimed automatically the first time you
     upload a build to Play Console; no separate registration step.
6. Create the app record in App Store Connect (name, primary language,
   bundle ID, SKU) and in Play Console (app name, default language) — both
   consoles want this shell record to exist before `eas submit` can push a
   build into it.
7. Fill in `eas.json`'s `submit.production` placeholders with your real
   values:
   - `appleId`: your Apple ID email
   - `ascAppId`: the App Store Connect app's numeric ID (Apple Developer
     portal → App Store Connect → your app → General → App Information)
   - `appleTeamId`: found in the Apple Developer portal under Membership
   - Android: generate a Google Play service account JSON key (Play Console
     → Setup → API access) and save it as
     `artifacts/wick-betts-mobile/google-play-service-account.json` (already
     covered by `.gitignore` — don't commit this file; it's a credential).

## 5. Build

From `artifacts/wick-betts-mobile`:

```
# Internal test build (TestFlight / internal Play track), not submitted to review
eas build --platform ios --profile preview
eas build --platform android --profile preview

# Store-ready build
eas build --platform ios --profile production
eas build --platform android --profile production
```

First iOS build will prompt to generate/upload a distribution certificate
and provisioning profile if EAS doesn't find one — accept the automatic
option unless you already manage certificates manually.

## 6. Submit

```
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

For iOS this uploads to App Store Connect / TestFlight; you still go into
App Store Connect afterward to fill in the listing (screenshots, description,
keywords, age rating, the privacy/data forms from step 3.5, and the
privacy policy URL from step 3.4) and press "Submit for Review." For Android,
`track: "internal"` in `eas.json` uploads to Play's internal testing track
first — promote to production from the Play Console once you've verified it.

## 7. Common rejection reasons worth checking before you submit

- Missing or broken "Sign in with Apple" — **not applicable here**, since
  Wick Betts uses Clerk with Google OAuth + email, and Apple only requires
  Sign in with Apple as an alternative if you offer *other* third-party
  login options (Google counts). Add Sign in with Apple if Google sign-in
  is the only social option users see, or expect a 4.8 rejection.
- Placeholder/lorem ipsum content, broken links, or a login wall with no way
  for a reviewer to see real functionality — make sure you provide App
  Review with demo credentials (App Store Connect → App Review Information)
  since the whole app sits behind Clerk auth + an active subscription gate.
  Reviewers cannot pay through Stripe themselves to unlock signals/community
  content, so either grant the demo account an active subscription
  server-side (via the admin panel) or note in the review notes that certain
  screens require a paid plan and explain what they'd see.
- Section 1: financial app — as covered above, a clear non-advice disclaimer
  visible in the app (already present in `app/legal.tsx`) reduces friction
  here.
