# Broker Handoff ("Take This Trade") — Plan

**Status:** Proposed · **Date:** 2026-09-17 · **Plans:** Signals ($250) + Mentorship ($500), no price change

> **Implemented scope (2026-09-18):** redirect only. Each Active,
> non-futures signal shows **Webull / Robinhood** buttons that open the
> asset's page on that broker. **No prefills, no clipboard, no price-drift
> check.** Prices move, so the member finds the contract and fills it
> themselves. Files: `api-server/src/services/brokerLinks.ts`, the
> `GET /api/signals` feed (`brokerLinks` field), and
> `wick-betts-mobile/components/TradeOnBroker.tsx`. The last-used broker is
> remembered on-device (AsyncStorage), so there's no schema change or
> migration. Sections 4.2–4.4 below that describe prefills, the clipboard,
> drift checks and new columns are **deferred**, not built.

## 1. The idea in one line

Every live signal gets a **Take This Trade** button. One tap opens a prefilled
ticket for that exact stock, crypto pair or option contract, then hands the
member off to **Webull or Robinhood**, where *they* decide whether to place it.
Wick Betts never places, holds, or sees an order in Phase 1.

## 2. Ground rules (why this stays low-risk)

| Rule | Why |
|---|---|
| The member always taps the final "Buy/Sell" inside the broker's app | Wick Betts is not the broker, and doesn't pick trades for anyone |
| The signal is the same for every member | Keeps Wick in the "publisher" lane: no personalization from account data |
| No broker passwords, ever | Phase 1 uses public links only; Phase 2 uses official OAuth only |
| No unofficial/reverse-engineered broker APIs | Robinhood's terms forbid it, and it's an account-ban risk for members |
| Futures (Day Trade) signals get no handoff button in v1 | Futures fall under the commodities regulator (CFTC); scope that separately |
| Closed / Stopped / Watching signals get no button | Only `status = Active` is tradable |

## 3. What's possible with each broker today

| | **Robinhood** | **Webull** |
|---|---|---|
| Public link to ticker page (stock/crypto) | ✅ web link, opens the app on phones via universal link | ✅ web quote page link |
| Public link straight to a *specific option contract* | ❌ not publicly documented | ❌ not publicly documented |
| Official API for a business app to place orders for members | ❌ Agentic Trading is only for a member's *own* AI agent on their own Agentic account | ✅ **Connect API** (OAuth 2.0): orders, positions, balances; stocks, options, crypto, futures |
| Plan | **Phase 1 handoff**, Phase 3 "bring your own agent" | **Phase 1 handoff**, **Phase 2 true prefill** |

Because neither broker publishes a contract-level link, Phase 1 lands the member
on the ticker's page and carries the exact contract with them (section 4.3).
That makes it "two taps to the contract," not zero. Phase 2 (Webull Connect)
removes those taps.

## 4. Phase 1 — Handoff (build now, ~1–2 weeks)

### 4.1 Member flow

```
Signals tab
┌──────────────────────────────────────────┐
│ NVDA  OPTION  LEAPS  Active  ★           │
│ Stocks · Technology · Long               │
│ CONTRACT  NVDA 15 JAN 27 130 C  ×1       │
│ Debit 18.40 · Target 31.00 · Stop 12.10  │
│                                          │
│  [  ⚡ Take This Trade  ]                 │  ← new, primary button
└──────────────────────────────────────────┘
                   │ tap
                   ▼
Trade Ticket (bottom sheet)
┌──────────────────────────────────────────┐
│ NVDA  Jan 15 '27  $130  CALL             │
│ Signal debit  $18.40   Live  ~$19.05 ▲3% │  ← price-drift check
│ Qty (signal size)  1   [−] [+]           │
│ Est. cost  ≈ $1,905                      │
│                                          │
│ Find it in your broker:                  │
│  ① Options  ② Jan 15 '27  ③ $130 Call    │  ← step pills
│                                          │
│ Open in:  (● Webull)  (○ Robinhood)      │  ← remembers last choice
│                                          │
│  [ Copy contract & open Webull → ]        │
│  You place the order. Wick Betts never   │
│  sees or touches your account.           │
└──────────────────────────────────────────┘
                   │ tap
                   ▼
Contract copied to clipboard → broker app opens on NVDA
→ member taps Options → Jan 15 '27 → $130 Call → reviews → decides
```

For **stock and crypto** signals the sheet is simpler: side, entry zone, target,
optional stop, and "Open NVDA in Webull". No steps are needed because the
ticker page *is* the trade screen.

### 4.2 What makes it feel intuitive

1. **One button, same place, every card.** Primary color, bottom of the card, not hidden in the expanded view.
2. **Broker memory.** First tap asks "Which broker do you use?" After that it's remembered (`users.preferred_broker`) and switchable in the sheet and in Settings.
3. **Price-drift guard.** Before handoff, the API fetches a live price. If the underlying has moved past the entry zone, or the option mid-price is more than 15% above the signal's debit, show an amber note: *"Price has moved since this signal: entry $18.40, now ~$21.30."* This protects members from chasing a stale call.
4. **The contract travels with them.** "Copy & open" puts `NVDA 01/15/2027 130 Call` on the clipboard and shows the three step pills matching the broker's own labels, so finding it in the chain is mechanical.
5. **Modeled prices are labeled.** If the signal's premium is modeled (Black-Scholes, ADR 0002), the sheet says *MODELED, check the live bid/ask*.
6. **"Did you take it?" (optional, Phase 1.5).** When the member returns to the app, a small prompt: *Took it / Skipped*. Only the member sees it. It feeds a private **My Trades journal**, which later pairs well with Review My Trade.
7. **Mentorship tie-in.** Mentorship members get a *"Discuss in my next call"* link on the sheet that attaches the signal to their next booking. There's no extra cost, just a reason the $500 tier feels richer.

### 4.3 Link templates (server-side, editable without an app release)

Links are built by the API, not hard-coded in the app, so a broker changing its
URL format is a config fix, not an App Store resubmission.

```ts
// artifacts/api-server/src/config/brokerLinks.ts
export const BROKER_LINKS = {
  robinhood: {
    stock:  (t) => `https://robinhood.com/us/en/stocks/${t}/`,
    crypto: (s) => `https://robinhood.com/us/en/crypto/${s}/`,
  },
  webull: {
    stock:  (t, exch) => `https://www.webull.com/quote/${exch}-${t.toLowerCase()}`,
    crypto: (s) => `https://www.webull.com/quote/ccc-${s.toLowerCase()}usd`,
  },
} as const;
```

⚠️ **Verify every template on a real iPhone and Android device with each app
installed and not installed** before launch. None of these paths are officially
documented as deep links. Record results in the checklist in section 8.

### 4.4 Data changes (Drizzle, via `drizzle-kit generate` per ADR 0001)

```ts
// signals: structured contract fields (today `contract` is free text like "NVDA 22 AUG 26 130 C")
expirationDate: date("expiration_date"),        // parsed from `expiration`
strikePrice:    numeric("strike_price"),        // parsed from `strike`
occSymbol:      text("occ_symbol"),             // e.g. NVDA  270115C00130000, built on insert/patch
exchange:       text("exchange"),               // "nasdaq" | "nyse" | ..., needed for Webull links

// users
preferredBroker: text("preferred_broker"),      // 'webull' | 'robinhood' | null

// new table: broker_handoffs (analytics + "did you take it")
id, userId, signalId, broker, openedAt, selfReported ('took'|'skipped'|null), reportedAt
```

A backfill script parses existing `contract` strings into the structured
columns. Admin signal studio and `signalScanner.ts` set them on every new
option signal. If parsing fails, the button still works but hides the step
pills.

### 4.5 API

| Route | Guard | Returns |
|---|---|---|
| `GET /api/signals/:id/handoff?broker=webull` | `requireAuth`, `requireSignalsPlan` | `{ url, clipboardText, steps[], livePrice, drift, isModeled }`. 409 if the signal isn't Active or is a futures signal |
| `POST /api/signals/:id/handoff` | same | logs a `broker_handoffs` row |
| `PATCH /api/handoffs/:id` | owner only | `{ selfReported }` |
| `PATCH /api/me` | `requireAuth` | `{ preferredBroker }` |

`requireSignalsPlan` (already in `routes/signals.ts`) is reused as-is. That's
what keeps the feature inside the $250 and $500 plans and off the base
Membership plan, with no new billing logic.

### 4.6 Mobile

- `components/TradeHandoffSheet.tsx`: the bottom sheet
- `SignalCard` in `app/(tabs)/signals.tsx`: add the button when `status === 'Active' && style !== 'Day Trade'`
- `Linking.openURL(url)` for handoff. On web export, open in a new tab.
- Clipboard: add `expo-clipboard` (**new dependency**: run `pnpm add` and commit `pnpm-lock.yaml` so the Docker `--frozen-lockfile` build doesn't break)
- `settings.tsx`: "Preferred broker" row
- First-use interstitial (shown once, stored on the user): *"You're leaving Wick Betts. Signals are the same for every member, generated by Wick's scanner and reviewed by Wick. They are not personalized advice. You decide whether to trade."*

### 4.7 Disclosure fixes that ship *with* this feature

- Restore an **"Algorithmically generated · Reviewed by Wick"** label on `source = 'auto'` signals. This reverses the member-facing part of ADR 0009's disclosure removal. Once a button makes acting on a signal one tap away, hiding that it came from a scanner is the riskiest piece.
- Add a short handoff section to `app/legal.tsx`.
- If you join the **Webull or Robinhood affiliate programs**, disclose it on the sheet ("Wick Betts may earn a referral fee if you open an account"). Never let payouts change which broker is preselected.

## 5. Phase 2 — Webull true prefill (after approval, ~3–4 weeks of build)

Webull's Connect API lets a member link their Webull account with OAuth, so
the ticket is prefilled **inside Wick Betts**. The member still makes the call:

```
Take This Trade → Webull (connected ✓)
┌──────────────────────────────────────────┐
│ BUY TO OPEN  NVDA 01/15/27 130C          │
│ Qty 1 · Limit $19.05 (edit)  · Day       │
│ Buying power  $8,214                      │
│ Est. cost  $1,905 + fees                  │
│                                          │
│  [ Hold to send to Webull ]              │  ← press-and-hold, never 1-tap
└──────────────────────────────────────────┘
```

**Hard rules for Phase 2**

- Every order requires an explicit **press-and-hold confirm**. No auto-submit, no "trade all signals," no copy-trading.
- Default order type is **Limit**, never Market, for options.
- Quantity defaults to the signal's `contractAmount` and is capped per order (e.g. ≤ 10 contracts, ≤ $10k) until you decide otherwise.
- Tokens are encrypted at rest (KMS or libsodium with a key in Railway secrets). Scopes are the minimum Webull allows.
- Every submission is written to an `order_audit` table: user, signal, request payload, Webull order ID, response, timestamps.
- A global kill switch env var (`BROKER_ROUTING_ENABLED=false`) hides the in-app ticket and falls back to the Phase 1 handoff.
- Account data (buying power, positions) is shown to the member only. It **must not** change which signals they see or add "you should" language. That keeps personalization out of the signal itself.

**Before building Phase 2, you need:**

1. **Webull partner approval.** The Connect docs describe the OAuth flow but not the business onboarding. Contact Webull's API/partnerships team for client credentials, terms, and whether options orders are enabled for Connect partners.
2. **Securities counsel sign-off** on Wick transmitting member orders to a broker (TradingView/Webull is the precedent to point to), and on Wick's overall adviser status given paid signals plus mentorship.

## 6. Phase 3 — "Bring your own agent" for Robinhood (optional, explore)

Robinhood doesn't let business apps place orders, but it *does* let a member
connect **their own** AI agent (Claude, ChatGPT, etc.) to a Robinhood Agentic
account. Wick Betts can meet that halfway:

- Publish a **read-only signals feed** (authenticated per member, same content as the Signals tab) as an MCP server or JSON endpoint.
- The member's own agent reads today's Wick signals. The member tells *their* agent what to do in *their* Robinhood Agentic account.
- Wick Betts never touches the Robinhood account.

This is novel and on-brand ("your AI, our signals"), but it makes automated
execution easy for members, so it needs counsel review first. Treat it as an
experiment, not a launch feature.

## 7. What this does *not* include

- Placing orders on Robinhood from Wick Betts (not permitted by Robinhood)
- Any personalized trade suggestions from connected-account data
- Futures handoff
- Auto-trading, copy-trading, or "follow this member's trades" execution

## 8. Launch checklist

**Phase 1**
- [ ] Deep-link templates verified: iOS and Android × app installed/not installed × Robinhood/Webull × stock/crypto
- [ ] Backfill of structured option fields run; spot-check 20 signals
- [ ] Price-drift thresholds set (underlying past entry zone; option mid more than 15% over debit)
- [ ] Interstitial, legal copy, and "Algorithmically generated" label shipped
- [ ] `expo-clipboard` added with lockfile committed; Docker build green
- [ ] Futures, Closed, Stopped and Watching signals confirmed to show no button
- [ ] Base Membership plan confirmed blocked (`requireSignalsPlan`)
- [ ] Affiliate disclosure added (if applicable)

**Phase 2**
- [ ] Webull partner agreement and client credentials
- [ ] Counsel memo on order transmission and adviser status
- [ ] Token encryption, `order_audit`, kill switch, per-order caps tested in Webull paper/sandbox
- [ ] App Store review notes updated (financial app + third-party brokerage linking)

## 9. Rough timeline

| Week | Work |
|---|---|
| 1 | Schema and backfill, `/handoff` API, link config, device verification |
| 2 | Sheet UI, broker memory, drift guard, disclosures, QA; ship Phase 1 |
| 2–6 | In parallel: Webull partner outreach and counsel review |
| +3–4 after approval | Phase 2 Webull Connect ticket |

## Sources

- Webull Connect API: https://developer.webull.com/apis/docs/connect-api/about-connect-api/
- Webull OpenAPI overview: https://developer.webull.com/apis/docs/
- Robinhood Agentic Trading overview: https://robinhood.com/us/en/support/articles/agentic-trading-overview/
- Robinhood third-party connections policy: https://robinhood.com/us/en/support/articles/third-party-connections/

*Not legal advice. Have securities counsel review before launch.*
