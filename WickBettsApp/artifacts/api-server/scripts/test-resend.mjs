// One-off connectivity check for the Resend account — NOT part of the app's
// runtime code. Confirms an API key actually works before wiring anything
// into production. Uses raw fetch against Resend's HTTP API rather than the
// `resend` npm package on purpose: the Docker build for this repo only ships
// `dist` + the already-locked node_modules (see docs/adr/0005), so adding a
// new dependency would need a working local `pnpm install` to regenerate
// pnpm-lock.yaml first. The real app's sender (utils/emailNotifications.ts)
// already sends this same way — this script just mirrors that pattern for a
// quick manual test, and is never imported by the running server.
//
// Usage (from artifacts/api-server, with RESEND_API_KEY set in your local
// .env — never commit the real key):
//   node --env-file=.env scripts/test-resend.mjs
//
// Before your sending domain is verified with Resend, their sandbox only
// lets you send FROM their shared test address (onboarding@resend.dev) TO
// the email address your Resend account itself was created with — that's
// why both are left as-is below rather than pointed at seaubank.com yet.
// Once seaubank.com is verified (see docs/email-alerts-plan.md), swap
// RESEND_FROM/RESEND_TO for the real sender/recipient and this same script
// still works.

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY is not set. Add it to your local .env (never commit it) and re-run with --env-file=.env.");
  process.exit(1);
}

const from = process.env.RESEND_FROM || "onboarding@resend.dev";
const to = process.env.RESEND_TO || "bettstahlik@gmail.com";

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  }),
});

if (!res.ok) {
  console.error(`Resend responded ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const body = await res.json();
console.log("Sent. Resend message id:", body.id);
