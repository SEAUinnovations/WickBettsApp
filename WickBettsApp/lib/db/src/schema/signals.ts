import { pgTable, text, timestamp, boolean, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const marketEnum = pgEnum("market", ["Stocks", "Crypto"]);
export const directionEnum = pgEnum("direction", ["Long", "Short"]);
export const signalStatusEnum = pgEnum("signal_status", ["Active", "Watching", "Closed", "Stopped"]);
export const optionTypeEnum = pgEnum("option_type", ["Call", "Put"]);
// Trading style/horizon for the setup — this is what tells a member the time
// expectancy of a trade at a glance. "Day Trade" is same-session, CME
// index/metals FUTURES (MES/MNQ/ES/NQ/MGC) — auto-generated daily by a
// dedicated scan (services/signalScanner.ts's runDayTradeScan, screening
// 4-hour bars, only publishing setups that clear a 1:3 reward:risk) as
// well as manually by an admin. Futures aren't modeled as options
// (isOption: false, no strike/premium/Greeks — see the isOption/optionType
// columns below) even though, like Swing/LEAPS, they're a leveraged
// contract rather than plain shares; `market` is "Stocks" for these today
// as a workaround (no dedicated "Futures" market value yet — see
// buildFuturesDayTradeSignal's doc comment), disambiguated via `sector`
// ("Index Futures"/"Metals Futures"). "Swing" is the original short-hold
// behavior (days/weeks, always has a stop) — a modeled stock options
// contract. "Buy & Hold" is a long-term spot position (stocks or crypto)
// with an entry + target but deliberately no stop — the thesis plays out
// over a long horizon, not a hard invalidation price; this is the one
// style that is always plain shares (isOption: false, market genuinely
// Stocks/Crypto). "LEAPS" is a long-dated stock options contract (6/8/12+
// months out).
export const signalStyleEnum = pgEnum("signal_style", ["Day Trade", "Swing", "Buy & Hold", "LEAPS"]);

export const signalsTable = pgTable("signals", {
  id: text("id").primaryKey(),
  asset: text("asset").notNull(),
  // GICS-style sector (e.g. "Technology", "Financials") for stocks, or a
  // short category label for crypto (e.g. "Smart Contract Platform").
  // Nullable — best-effort enrichment, not every data source returns one.
  sector: text("sector"),
  market: marketEnum("market").notNull(),
  direction: directionEnum("direction").notNull(),
  status: signalStatusEnum("status").notNull().default("Active"),
  style: signalStyleEnum("style").notNull().default("Swing"),
  entry: text("entry").notNull(),
  target: text("target").notNull(),
  // Nullable: Buy & Hold signals intentionally have no hard stop-loss (see
  // signalStyleEnum comment above) — Swing and LEAPS signals still set this.
  stop: text("stop"),
  timeframe: text("timeframe").notNull(),
  risk: text("risk").notNull().default("Medium"),
  analysis: text("analysis").notNull(),
  isOption: boolean("is_option").notNull().default(false),
  optionType: optionTypeEnum("option_type"),
  contract: text("contract"),
  expiration: text("expiration"),
  strike: text("strike"),
  premium: text("premium"),
  bid: text("bid"),
  ask: text("ask"),
  impliedVolatility: text("implied_volatility"),
  delta: real("delta"),
  gamma: real("gamma"),
  theta: real("theta"),
  vega: real("vega"),
  openInterest: text("open_interest"),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // 'manual' (admin-authored) or 'auto' (produced by the scheduled signal
  // scanner). Auto signals land as status "Watching" for admin review.
  source: text("source").notNull().default("manual"),
  // "Keep in mind" star: true when the trade's expected window crosses a
  // major macro event (FOMC/CPI/jobs report) or the symbol's own earnings date.
  newsAlert: boolean("news_alert").notNull().default(false),
  newsAlertNote: text("news_alert_note"),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ createdAt: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
