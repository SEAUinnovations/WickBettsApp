# Wick Signals for AI Agents (MCP Server) — Plan

**Status:** Proposed · **Date:** 2026-09-18 · **Plans:** Signals ($250) + Mentorship ($500)
**Related:** `docs/broker-handoff-plan.md` (Phase 3 there is this doc), ADR 0002 (scanner trust model)

---

## 1. What we're building

A **read-only Wick Betts MCP server** that lets a member connect Wick's signals
to *their own* AI assistant (Claude, ChatGPT, Cursor, and others). If that same
assistant is also connected to their **Robinhood Agentic account** (Robinhood's
own MCP), the member can tell their assistant to research or trade from Wick
signals. Orders are placed by Robinhood in the member's agent account, under
the budget and approval settings the member set there.

```
            member's AI assistant (Claude / ChatGPT / ...)
               │                               │
      reads signals                     places orders
               ▼                               ▼
   ┌───────────────────────┐        ┌────────────────────────┐
   │  Wick Betts MCP        │        │  Robinhood MCP          │
   │  (this plan)           │        │  (Robinhood's, not ours)│
   │  read-only, no orders  │        │  member's agent account │
   └───────────┬───────────┘        └────────────────────────┘
               │
     same DB + plan gate as the Signals tab
```

**Wick Betts never:** holds broker credentials, sees the member's
Robinhood account, places or suggests order sizes, or tailors signals to
anyone.

## 2. Member experience

### Setup (one time, about 2 minutes)
1. **Settings → Connect your AI** (new screen) shows the server URL plus
   copy-paste steps for Claude, ChatGPT and Cursor (section 10).
2. The member adds the URL as a custom connector. Their assistant opens the
   Wick Betts sign-in (Clerk), they approve, and it's connected.
3. Optional: they connect Robinhood's MCP to the same assistant, following
   Robinhood's own instructions.

### Example conversations
- *"What are today's Wick signals?"* → `list_signals`
- *"Anything new or closed since yesterday?"* → `get_signal_updates`
- *"Walk me through the NVDA LEAPS thesis and the news risk."* → `get_signal`
- *"If the AMD signal is still within 2% of entry, buy $300 in my Robinhood agent account."*
  → the assistant reads Wick (entry, published time), checks the live price
  with **Robinhood's** tools, previews the order, and the member approves in
  their assistant/Robinhood. Every rule in that sentence came from the member.

## 3. Legal guardrails (build these in; not optional)

Signals stay a **publication**: impersonal, bona fide, regularly published.
Everything below protects that.

| Guardrail | How it's enforced |
|---|---|
| Identical output for every member | Tool handlers never read a member's positions, balance, watchlist or broker data. Code review rule plus a test that two members get identical `list_signals` output |
| No order tools | The server registers zero tools that place, size or route orders. No `recommend_size`, no "should I buy" tool |
| No personalized language | Tool descriptions and server instructions say "research data", never "you should" |
| Stale-price protection | Every signal carries `publishedAt`, `ageHours`, and an explicit note that entry reflects the price at publication |
| Disclosures travel with the data | Every tool response includes a `disclosure` field; server `instructions` repeat it |
| Algorithmic origin disclosed | `origin: "algorithmic_reviewed" \| "analyst"`, which fixes the ADR 0009 disclosure gap for this channel |
| Modeled option prices flagged | `option.premiumIsModeled: true` on scanner-built option signals |
| Futures excluded (v1) | Day Trade / futures signals aren't served (CFTC scope; Robinhood agents don't trade them) |
| Marketing | "Connect Wick's research to your AI." Never "auto-trade Wick" or "copy our trades" (section 12) |

**Gate before public marketing:** securities counsel on investment-adviser
registration (state RIA is the likely path). Build and private-beta can
proceed. Promotion to all members waits for that answer.

## 4. Architecture

- **Where:** inside the existing Express API (`artifacts/api-server`). No new
  service. Same Postgres, same deploy.
- **Transport:** MCP **Streamable HTTP**, stateless mode (a new server and
  transport per request). No sessions to store, and it survives Railway restarts
  and scaling.
- **Endpoint:** `POST /api/mcp` (GET/DELETE return 405 in stateless mode).
  - Under `/api/*` so the Cloudflare Worker on wickbetts.com proxies it with
    no Worker change. **Verify** the Worker passes the `Authorization`
    header and doesn't buffer or strip `text/event-stream` responses.
    Otherwise publish the Railway API hostname as the connector URL instead.
- **Packages (new):** `@modelcontextprotocol/sdk`, `@clerk/mcp-tools`.
  `cors` is already installed. Add with `pnpm add` and **commit
  `pnpm-lock.yaml`** so the Docker `--frozen-lockfile` build doesn't fail.
  Pin the `@clerk/mcp-tools` major version that matches the SDK major version
  (Clerk ships a separate v2 for MCP SDK v2).
- **Kill switch:** `MCP_ENABLED=false` makes `/api/mcp` return 503 and hides
  the Settings screen (via `/api/config`).

## 5. Authentication

### v1: Clerk OAuth (primary)
The app already uses Clerk, and Clerk has first-party MCP support for Express:

- **Clerk Dashboard → OAuth applications:** enable dynamic client
  registration / "Publish CIMD support", and set default scopes for dynamic
  clients (`profile email`).
- **Routes:**
  - `POST /api/mcp`: `mcpAuthClerk` → plan gate → MCP handler
  - `GET /.well-known/oauth-protected-resource/api/mcp`: `protectedResourceHandlerClerk` (public)
  - `GET /.well-known/oauth-authorization-server`: Clerk's auth-server metadata handler (public)
  - Register the `.well-known` routes **before** the SPA catch-all in `app.ts`,
    and make sure the Worker (or Railway host) serves them.
- **Identity:** `authInfo.extra.userId` is the Clerk user ID. Map it to the local user
  with a new exported helper in `middlewares/requireAuth.ts`,
  `resolveDbUserByClerkId(userId)`, which reuses `resolveClerkIdentity` and
  `jitProvisionUser` so MCP and app logins resolve to the same `users` row.

### v1.1: personal access token (fallback, optional)
For clients that don't do OAuth but accept a header (Cursor, Claude Code, scripts):
- Settings → "Generate agent token". Shown once, stored **hashed** (SHA-256)
  in a new `mcp_tokens` table (`id, userId, tokenHash, label, createdAt,
  lastUsedAt, revokedAt`).
- Sent as `Authorization: Bearer wbk_...`. Revocable, read-only, max 3 per member.
- Never accepted in a URL or query string.

### Plan gate
Reuse the existing entitlement logic from `requireSignalsPlan`
(`routes/signals.ts`). Extract its core into `lib/entitlements.ts` →
`hasSignalsPlan(user): Promise<"ok" | "SUBSCRIPTION_REQUIRED" | "SIGNALS_PLAN_REQUIRED">`
so both the REST route and MCP call one function. An unentitled caller gets an
MCP tool error with a clear message and upgrade URL, not a crash.
Entitlement is checked **per request**, so a cancelled plan stops the feed immediately.

## 6. Tools (all read-only)

Each tool is annotated `readOnlyHint: true, openWorldHint: false,
destructiveHint: false`, which lets ChatGPT and Claude treat it as safe to run
without write-confirmation prompts.

| Tool | Input | Returns |
|---|---|---|
| `list_signals` | `market?` ("stocks"\|"crypto"), `type?` ("stock"\|"option"\|"crypto"), `style?` ("Swing"\|"Buy & Hold"\|"LEAPS"), `direction?`, `limit?` (1–25, default 10) | Active signals, newest first |
| `get_signal` | `id` | One signal, full detail incl. analysis text. Returns a "not active" error for Watching; Closed/Stopped allowed (so agents can see a call ended) |
| `get_signal_updates` | `since` (ISO time, max 14 days back) | `{ newSignals[], statusChanges[] (Active→Closed/Stopped), resultChanges[] }`, the polling tool agents use to learn a call is over |
| `get_scoreboard` | none | Green/Missed/Pending counts, win rate among decided calls, the 20% definition, and a note that Pending calls are excluded |
| `get_market_news` | `limit?` (1–10) | Headline, summary, affected assets, time (same feed as the News tab) |
| `get_disclosures` | none | Full disclosure text + links to legal page |

**Not included on purpose:** watchlist, portfolio, anything that reads member
data; any "rank these for me" or "which should I buy" tool.

### Signal object (response shape)

```jsonc
{
  "id": "sig_…",
  "asset": "NVDA",
  "assetType": "option",            // stock | option | crypto
  "market": "Stocks",
  "direction": "Long",
  "style": "LEAPS",                 // Swing | Buy & Hold | LEAPS
  "horizon": "6–12 months",         // from styleDurationHint-equivalent
  "status": "Active",
  "origin": "algorithmic_reviewed", // or "analyst"
  "publishedAt": "2026-09-18T14:02:00Z",
  "ageHours": 5.4,
  "statusChangedAt": "2026-09-18T14:02:00Z",
  "levels": {
    "entry":  { "text": "18.40", "value": 18.40 },   // value = parsed number or null
    "target": { "text": "31.00", "value": 31.00 },
    "stop":   { "text": "12.10", "value": 12.10 },   // null for Buy & Hold
    "levelsReferTo": "option premium"                // or "underlying price"
  },
  "option": {                       // null unless assetType = option
    "type": "Call", "strike": "130", "expiration": "15 JAN 27",
    "contractLabel": "NVDA 15 JAN 27 130 C", "contractsInSetup": 1,
    "premiumIsModeled": true,
    "greeksAtPublish": { "delta": 0.62, "theta": -0.04, "iv": "48%" }
  },
  "risk": "Medium",
  "newsWarning": { "flagged": true, "note": "Earnings Oct 22 inside the window" },
  "analysis": "…Wick's Read…",
  "priceNote": "Levels reflect prices at publication (5.4h ago). Check the live price before acting.",
  "disclosure": "General research published identically to all Wick Betts members. Not personalized advice. Wick Betts does not place, size, or route orders."
}
```

Only fields that already exist are exposed. The one new DB column is
`statusChangedAt` (section 7).

### Server `instructions` (sent to every client on connect)
> Wick Betts provides general trading research published identically to all
> members. It is not personalized advice and does not know the user's
> account. Signal levels reflect prices at publication. Always check the live
> price before any action. Never place an order based on a Wick signal
> without the user's explicit instruction, and follow the user's own budget
> and rules. Futures signals are not included. Present the disclosure when
> summarizing signals.

### Prompts (optional, nice UX)
- `daily_briefing`: "Summarize today's active Wick signals, what changed since
  yesterday, and any news warnings."
- `signal_deep_dive(id)`: the thesis, levels and risks for one signal.

## 7. Data changes (via `drizzle-kit generate`, ADR 0001)

1. `signals.status_changed_at timestamp`: set on insert and whenever
   `status` changes in `PATCH /api/signals/:id` (and anywhere the scanner or
   scoreboard updates status). Backfill it with `created_at`. Needed for
   `get_signal_updates`.
2. `mcp_tokens` (v1.1 only, section 5).
3. `mcp_tool_calls` (usage + audit): `id, userId, tool, argsJson,
   resultCount, clientName, createdAt`. Truncate args to 1 KB and never store
   response bodies. Purge rows after 90 days. It answers who uses this, how
   often, and from which client. It's also useful evidence for counsel that
   the feed is impersonal.

## 8. Limits and abuse

- **Rate limit:** separate bucket, `rateLimit({ name: "mcp", max: 120, windowMs: 5 min })` per user.
  Agents poll, and this shouldn't eat the app's `api` bucket.
- **Response size:** `limit` ≤ 25, analysis text trimmed to 4,000 chars in list
  view (full text in `get_signal`), no chart images (base64 is too large for
  agents; offer a `chartUrl` later if wanted).
- **Redistribution:** tokens and OAuth grants are per member. `mcp_tool_calls`
  lets you spot one account feeding many people (e.g. 10k calls a day), and
  your terms should prohibit resale or redistribution.

## 9. Files

| File | Change |
|---|---|
| `api-server/src/mcp/server.ts` | **new**: `buildWickMcpServer(user)` registers tools, prompts, instructions |
| `api-server/src/mcp/tools.ts` | **new**: tool handlers + zod input schemas |
| `api-server/src/mcp/serialize.ts` | **new**: DB row → signal object (section 6), number parsing, horizon, origin, disclosure |
| `api-server/src/routes/mcp.ts` | **new**: `/api/mcp` + `.well-known` routes, Clerk auth, gate, kill switch, logging |
| `api-server/src/lib/entitlements.ts` | **new**: shared `hasSignalsPlan`, used by `routes/signals.ts` too |
| `api-server/src/middlewares/requireAuth.ts` | export `resolveDbUserByClerkId` |
| `api-server/src/middlewares/rateLimit.ts` | add `mcpRateLimit` |
| `api-server/src/routes/signals.ts` | use `entitlements.ts`; set `statusChangedAt` on status change |
| `api-server/src/app.ts` | mount `.well-known` before the SPA catch-all |
| `lib/db/src/schema/signals.ts`, `schema/mcpToolCalls.ts` | columns/tables above + generated migration + journal |
| `wick-betts-mobile/app/connect-ai.tsx` | **new**: "Connect your AI" screen (URL, copy button, per-client steps, disclosure) |
| `wick-betts-mobile/app/settings.tsx` | link to it (Signals/Mentorship plans only) |
| `wick-betts-mobile/app/legal.tsx` | add "AI agent access" section |
| `docs/adr/0012-mcp-agent-feed.md` | decision record (read-only, impersonal, Clerk OAuth, stateless) |

## 10. Client setup copy (for the Connect your AI screen)

- **Claude (web/desktop):** Settings → Connectors → Add custom connector → paste
  `https://wickbetts.com/api/mcp` → Connect → sign in to Wick Betts.
- **ChatGPT:** custom MCP connectors are in beta on Business/Enterprise/Edu,
  and Pro users can connect read/fetch MCPs in Developer Mode → Settings →
  Apps & Connectors → Create → paste URL → OAuth sign-in. Because every Wick
  tool is read-only, this works on Pro.
- **Cursor / Claude Code:** add the server URL to MCP config (OAuth), or use a
  v1.1 personal token as a Bearer header.
- **Robinhood:** "To trade, connect Robinhood's Agentic MCP to the same
  assistant using Robinhood's instructions. Wick Betts never connects to your
  brokerage."

*(Re-check each vendor's menu names right before launch. They change often.)*

## 11. Testing

- **Unit:** serializer (number parsing of `entry`/`stop` text, horizon,
  modeled flag, Buy & Hold null stop); futures excluded; Watching never
  returned; `since` bounds.
- **Gate:** member on Membership plan gets `SIGNALS_PLAN_REQUIRED` tool error;
  lapsed member gets `SUBSCRIPTION_REQUIRED`; admin gets everything except
  Watching (the agent feed never shows Watching, even to admins).
- **Impersonal test:** two different entitled users get byte-identical
  `list_signals` output (minus `ageHours` rounding).
- **Protocol:** run the official **MCP Inspector** against a local server;
  test the OAuth discovery flow end to end with Claude and ChatGPT dev mode.
- **CI:** extend `backend-test.yml` smoke tests with an `initialize` +
  `tools/list` call using a test-mode token (v1.1) or a mocked auth context.

## 12. Marketing language

| Use | Avoid |
|---|---|
| "Connect Wick's research to your own AI" | "Auto-trade Wick signals" |
| "Ask your assistant about today's Wick signals" | "Let our AI trade for you" |
| "Your AI, your rules, your broker" | "Copy our trades", "set it and forget it" |
| Scoreboard with its definition and Pending excluded | Win rate without context, "guaranteed", "can't lose" |

## 13. Rollout

| Step | Work | Est. |
|---|---|---|
| 1 | `entitlements.ts`, `statusChangedAt` migration, serializer + unit tests | 1 day |
| 2 | MCP server, tools, stateless route, rate limit, logging, kill switch | 1–1.5 days |
| 3 | Clerk OAuth wiring + `.well-known` + Worker/header verification | 1 day |
| 4 | Connect your AI screen, legal copy, ADR | 0.5–1 day |
| 5 | Private beta (you + 5–10 members), MCP Inspector, Claude/ChatGPT/Cursor tests | 1 week, calendar time |
| 6 | Counsel answer on RIA → then announce to all Signals/Mentorship members | — |
| later | v1.1 personal tokens; `chartUrl`; "signal published" webhooks for agent platforms that support them | — |

**Total build:** about 4–5 dev days, then beta.

## 14. Open questions for you

1. **Include futures Day Trade signals?** Plan says no for v1 (CFTC, and Robinhood agents can't trade them).
2. **Include recently Closed/Stopped signals in `list_signals`,** or only via `get_signal_updates`? Plan: updates only.
3. **Serve the Mentorship-only extras** (if any exist) differently? Plan: Signals and Mentorship get the identical feed.
4. **Connector URL:** `wickbetts.com/api/mcp` (through the Worker) or the Railway API host? Depends on the Worker check in section 4.

## Sources

- Robinhood Agentic Trading: https://robinhood.com/us/en/agentic-trading/
- Robinhood Agentic Trading overview: https://robinhood.com/us/en/support/articles/agentic-trading-overview/
- Clerk — Build an MCP server (Express): https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server
- Clerk mcp-tools: https://github.com/clerk/mcp-tools
- MCP TypeScript SDK (server docs): https://ts.sdk.modelcontextprotocol.io/documents/server.html
- ChatGPT developer mode & MCP apps: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

*Not legal advice. Have securities counsel review before promoting agent access.*
