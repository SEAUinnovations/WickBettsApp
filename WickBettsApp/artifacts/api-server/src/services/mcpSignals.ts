/**
 * Wick signals as agent-readable data — the tool layer behind the MCP agent
 * feed (routes/mcp.ts). See docs/wick-agent-feed-plan.md.
 *
 * Ground rules (keep these true when editing):
 *   - Read-only. No tool here places, sizes, or routes orders.
 *   - Impersonal. Output never depends on who's asking — no watchlist,
 *     positions, balances, or broker data is read. Two members get the
 *     same answer.
 *   - Never "Watching" (unreviewed scanner candidates), even for admins.
 *   - No futures / Day Trade signals (separate CFTC scope; Robinhood agent
 *     accounts can't trade them anyway).
 */
import { db, signalsTable } from "../lib/db.js";
import { and, desc, eq, gte, inArray, ne, type SQL } from "drizzle-orm";
import { computeScoreboardStats } from "../routes/signals.js";

type SignalRow = typeof signalsTable.$inferSelect;

export const DISCLOSURE =
  "General trading research published identically to all Wick Betts members. Not personalized investment advice. " +
  "Wick Betts does not know your account and does not place, size, or route orders. Levels reflect prices at publication — " +
  "check the live price before acting. Trading involves risk of loss.";

export const SERVER_INSTRUCTIONS =
  "Wick Betts provides general trading research (signals) published identically to all members. It is not personalized " +
  "advice and does not know the user's account, positions, or budget. Signal levels (entry/target/stop) reflect prices at " +
  "publication time — always check the live price with the user's broker tools before any action. Never place an order " +
  "based on a Wick signal unless the user has explicitly told you to, and follow the user's own budget and rules. " +
  "option.premiumIsModeled=true means the option price was estimated, not quoted — verify the real bid/ask. " +
  "Futures signals are not included. Include the disclosure when summarizing signals.";

const MAX_ANALYSIS_IN_LIST = 1200;

function isFutures(s: SignalRow): boolean {
  return s.style === "Day Trade" || Boolean(s.sector && /futures/i.test(s.sector));
}

/** First number in a free-text level like "$18.40", "180-185", "1,234.5". */
function firstNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function level(text: string | null | undefined) {
  return text ? { text, value: firstNumber(text) } : null;
}

function horizon(style: string): string {
  switch (style) {
    case "LEAPS": return "6+ months (long-dated option)";
    case "Buy & Hold": return "Long-term hold (months+)";
    default: return "Days to weeks";
  }
}

function assetType(s: SignalRow): "stock" | "option" | "crypto" {
  if (s.isOption) return "option";
  return s.market === "Crypto" ? "crypto" : "stock";
}

export function serializeSignal(s: SignalRow, opts: { full?: boolean } = {}) {
  const now = Date.now();
  const published = new Date(s.createdAt);
  const ageHours = Math.round(((now - published.getTime()) / 36e5) * 10) / 10;
  const analysis = opts.full || s.analysis.length <= MAX_ANALYSIS_IN_LIST
    ? s.analysis
    : `${s.analysis.slice(0, MAX_ANALYSIS_IN_LIST)}… (use get_signal for the full write-up)`;

  return {
    id: s.id,
    asset: s.asset,
    assetType: assetType(s),
    market: s.market,
    sector: s.sector ?? null,
    direction: s.direction,
    style: s.style,
    horizon: horizon(s.style),
    timeframe: s.timeframe,
    status: s.status,
    origin: s.source === "auto" ? "algorithmic_reviewed" : "analyst",
    publishedAt: published.toISOString(),
    ageHours,
    levels: {
      entry: level(s.entry),
      target: level(s.target),
      stop: level(s.stop),
      levelsReferTo: s.isOption ? "option premium per share" : "asset price",
    },
    option: s.isOption
      ? {
          type: s.optionType ?? null,
          strike: s.strike ?? null,
          expiration: s.expiration ?? null,
          contractLabel: s.contract ?? null,
          contractsInSetup: s.contractAmount,
          premiumAtPublish: s.premium ?? null,
          premiumIsModeled: s.source === "auto",
          greeksAtPublish: { delta: s.delta, gamma: s.gamma, theta: s.theta, vega: s.vega, impliedVolatility: s.impliedVolatility ?? null },
        }
      : null,
    risk: s.risk,
    newsWarning: { flagged: s.newsAlert, note: s.newsAlertNote ?? null },
    result: { tag: s.resultTag, bestMovePercent: s.resultPercent ?? null },
    analysis,
    priceNote: `Levels reflect prices at publication (${ageHours}h ago). Check the live price before acting.`,
  };
}

// ── Tools ────────────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export class ToolInputError extends Error {}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

async function visibleRows(where?: SQL) {
  const base = ne(signalsTable.status, "Watching");
  const rows = await db
    .select()
    .from(signalsTable)
    .where(where ? and(base, where) : base)
    .orderBy(desc(signalsTable.createdAt))
    .limit(100);
  return rows.filter((s) => !isFutures(s));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_signals",
    title: "List active Wick signals",
    description:
      "Active Wick Betts trade signals (stocks, options/LEAPS, crypto), newest first. General research, identical for every member — not personalized advice.",
    inputSchema: {
      type: "object",
      properties: {
        assetType: { type: "string", enum: ["stock", "option", "crypto"], description: "Filter by what the signal trades." },
        style: { type: "string", enum: ["Swing", "Buy & Hold", "LEAPS"] },
        direction: { type: "string", enum: ["Long", "Short"] },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      additionalProperties: false,
    },
    async run(args) {
      const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 25);
      const type = str(args.assetType);
      const style = str(args.style);
      const direction = str(args.direction);
      const rows = (await visibleRows(eq(signalsTable.status, "Active")))
        .filter((s) => !type || assetType(s) === type)
        .filter((s) => !style || s.style === style)
        .filter((s) => !direction || s.direction === direction)
        .slice(0, limit);
      return { count: rows.length, signals: rows.map((s) => serializeSignal(s)), disclosure: DISCLOSURE };
    },
  },
  {
    name: "get_signal",
    title: "Get one Wick signal",
    description: "Full detail for one Wick Betts signal by id, including the complete analysis (\"Wick's Read\"). Works for Active, Closed, and Stopped signals.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Signal id from list_signals or get_signal_updates." } },
      required: ["id"],
      additionalProperties: false,
    },
    async run(args) {
      const id = str(args.id);
      if (!id) throw new ToolInputError("`id` is required.");
      const [row] = await visibleRows(eq(signalsTable.id, id));
      if (!row) throw new ToolInputError(`No published signal with id ${id}.`);
      return { signal: serializeSignal(row, { full: true }), disclosure: DISCLOSURE };
    },
  },
  {
    name: "get_signal_updates",
    title: "What changed since a time",
    description:
      "Signals published since `since`, plus recently ended (Closed/Stopped) signals so you can tell when a call is over. Use this to poll for new calls.",
    inputSchema: {
      type: "object",
      properties: { since: { type: "string", description: "ISO 8601 timestamp, at most 14 days ago. Defaults to 24 hours ago." } },
      additionalProperties: false,
    },
    async run(args) {
      const floor = Date.now() - 14 * 24 * 36e5;
      const parsed = str(args.since) ? Date.parse(str(args.since)!) : Date.now() - 24 * 36e5;
      if (Number.isNaN(parsed)) throw new ToolInputError("`since` must be an ISO 8601 timestamp.");
      const since = new Date(Math.max(parsed, floor));
      const [fresh, ended] = await Promise.all([
        visibleRows(gte(signalsTable.createdAt, since)),
        visibleRows(and(inArray(signalsTable.status, ["Closed", "Stopped"]), gte(signalsTable.createdAt, new Date(floor)))),
      ]);
      return {
        since: since.toISOString(),
        newSignals: fresh.map((s) => serializeSignal(s)),
        // No per-signal "closed at" timestamp is stored yet — this is every
        // signal from the last 14 days that has since ended; compare ids
        // against what you saw last time.
        recentlyEnded: ended.map((s) => ({ id: s.id, asset: s.asset, status: s.status, style: s.style, result: s.resultTag })),
        disclosure: DISCLOSURE,
      };
    },
  },
  {
    name: "get_scoreboard",
    title: "Wick track record",
    description:
      "Wick Betts scoreboard: Green (underlying moved 20%+ in the called direction since entry) vs Missed, and win rate among decided calls. Pending calls are excluded from the win rate. Past results don't guarantee future results.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const rows = await visibleRows();
      return { ...computeScoreboardStats(rows), note: "Win rate counts decided calls only (Green + Missed); Pending calls are excluded. Past results don't guarantee future results.", disclosure: DISCLOSURE };
    },
  },
];

export const TOOL_LIST = TOOLS.map(({ name, title, description, inputSchema }) => ({
  name,
  title,
  description,
  inputSchema,
  annotations: { title, ...READ_ONLY },
}));
