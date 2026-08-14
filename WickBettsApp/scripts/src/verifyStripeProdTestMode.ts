type CheckResult = {
  name: string;
  method: string;
  url: string;
  expected: string;
  ok: boolean;
  status: number;
  detail: string;
};

const APP_ORIGIN = (process.env.APP_ORIGIN_TO_TEST ?? "https://wickbetts.com").replace(/\/$/, "");
const RAILWAY_ORIGIN = (process.env.RAILWAY_ORIGIN_TO_TEST ?? "https://wickbettsapp-production.up.railway.app").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS ?? "12000");
const ENFORCE_TEST_KEY_PREFIX = process.env.ENFORCE_TEST_KEY_PREFIX !== "false";

function is2xx(status: number): boolean {
  return status >= 200 && status < 300;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function fetchText(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    ...init,
    signal: withTimeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  return { status: response.status, body };
}

function excerpt(text: string, length = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function testKeyAudit(): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const publishable = process.env.STRIPE_PUBLISHABLE_KEY?.trim();

  if (!secret) {
    messages.push("STRIPE_SECRET_KEY not set locally (cannot verify key prefix from this machine).");
  } else if (secret.startsWith("sk_test_")) {
    messages.push("STRIPE_SECRET_KEY is labeled test (sk_test_). ");
  } else if (secret.startsWith("sk_live_")) {
    messages.push("STRIPE_SECRET_KEY is live (sk_live_) and must not be used for test-mode validation.");
    if (ENFORCE_TEST_KEY_PREFIX) return { ok: false, messages };
  } else {
    messages.push("STRIPE_SECRET_KEY does not use a recognized Stripe prefix.");
    if (ENFORCE_TEST_KEY_PREFIX) return { ok: false, messages };
  }

  if (!publishable) {
    messages.push("STRIPE_PUBLISHABLE_KEY not set locally (cannot verify key prefix from this machine).");
  } else if (publishable.startsWith("pk_test_")) {
    messages.push("STRIPE_PUBLISHABLE_KEY is labeled test (pk_test_). ");
  } else if (publishable.startsWith("pk_live_")) {
    messages.push("STRIPE_PUBLISHABLE_KEY is live (pk_live_) and must not be used for test-mode validation.");
    if (ENFORCE_TEST_KEY_PREFIX) return { ok: false, messages };
  } else {
    messages.push("STRIPE_PUBLISHABLE_KEY does not use a recognized Stripe prefix.");
    if (ENFORCE_TEST_KEY_PREFIX) return { ok: false, messages };
  }

  return { ok: true, messages };
}

async function runCheck(
  name: string,
  method: string,
  url: string,
  expected: string,
  predicate: (status: number, body: string) => boolean,
  init?: RequestInit,
): Promise<CheckResult> {
  try {
    const { status, body } = await fetchText(url, { method, ...init });
    const ok = predicate(status, body);
    return {
      name,
      method,
      url,
      expected,
      ok,
      status,
      detail: excerpt(body),
    };
  } catch (error) {
    return {
      name,
      method,
      url,
      expected,
      ok: false,
      status: 0,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: CheckResult[]): void {
  console.log("\nStripe Production Test-Mode Verification");
  console.log("======================================");
  console.log(`APP_ORIGIN_TO_TEST=${APP_ORIGIN}`);
  console.log(`RAILWAY_ORIGIN_TO_TEST=${RAILWAY_ORIGIN}`);
  console.log(`VERIFY_TIMEOUT_MS=${REQUEST_TIMEOUT_MS}`);
  console.log("");

  for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    console.log(`[${mark}] ${result.name}`);
    console.log(`  request: ${result.method} ${result.url}`);
    console.log(`  expect:  ${result.expected}`);
    console.log(`  status:  ${result.status}`);
    console.log(`  detail:  ${result.detail || "<empty>"}`);
  }
}

async function main(): Promise<void> {
  const keyAudit = testKeyAudit();
  console.log("Stripe key prefix audit (local env):");
  for (const message of keyAudit.messages) {
    console.log(`- ${message}`);
  }

  if (!keyAudit.ok) {
    console.error("\nAborting: key prefix enforcement failed. Use test keys only for this workflow.");
    process.exit(1);
  }

  const checks: Promise<CheckResult>[] = [
    runCheck(
      "Production health endpoint",
      "GET",
      `${APP_ORIGIN}/healthz`,
      "HTTP 200",
      (status) => status === 200,
    ),
    runCheck(
      "Production API health endpoint",
      "GET",
      `${APP_ORIGIN}/api/healthz`,
      "HTTP 200",
      (status) => status === 200,
    ),
    runCheck(
      "Railway origin health endpoint",
      "GET",
      `${RAILWAY_ORIGIN}/healthz`,
      "HTTP 200",
      (status) => status === 200,
    ),
    runCheck(
      "Production news feed endpoint",
      "GET",
      `${APP_ORIGIN}/api/news/feed`,
      "HTTP 200 with JSON body",
      (status, body) => status === 200 && (body.startsWith("{") || body.startsWith("[")),
    ),
    runCheck(
      "CORS preflight for checkout endpoint",
      "OPTIONS",
      `${APP_ORIGIN}/api/stripe/create-checkout`,
      "HTTP 200/204/401/403 (endpoint reachable through proxy)",
      (status) => [200, 204, 401, 403].includes(status),
      {
        headers: {
          Origin: APP_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,authorization",
        },
      },
    ),
    runCheck(
      "Checkout route auth guard",
      "POST",
      `${APP_ORIGIN}/api/stripe/create-checkout`,
      "HTTP 401 when called without auth token",
      (status) => status === 401,
      {
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
        },
        body: JSON.stringify({ plan: "signals" }),
      },
    ),
  ];

  const results = await Promise.all(checks);
  printResults(results);

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error("\nVerification failed. Resolve failed checks before running full Stripe E2E checkout tests.");
    process.exit(1);
  }

  console.log("\nVerification passed. Runtime and Stripe route readiness checks are green for test-mode E2E execution.");
}

void main();
