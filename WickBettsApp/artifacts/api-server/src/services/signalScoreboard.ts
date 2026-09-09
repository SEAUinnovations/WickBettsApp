import { fetchStockDailyBars, fetchCryptoDailyBars } from "./marketHistory.js";

/**
 * Scoreboard verification — "did the call actually do 20%+?" This is
 * deliberately separate from `target` on signalsTable: `target` is the
 * admin's stated price objective for the setup, while this is a fixed,
 * always-the-same-bar scoreboard metric (best favorable move since `entry`)
 * used to tag every signal Green/Missed/Pending for win-rate reporting —
 * see resultTag/resultPercent on signalsTable and routes/signals.ts's
 * POST /:id/verify.
 */
export const SCOREBOARD_TARGET_PERCENT = 20;

// Mirrors services/signalScanner.ts's CRYPTO_UNIVERSE symbol -> CoinGecko id
// mapping. Not imported from there directly — signalScanner.ts doesn't
// export it and pulling it in would drag along that whole scheduler
// module's side-effect-on-import (it self-starts its scan schedulers) into
// every request that verifies a signal. Duplicated on purpose; keep both
// lists in sync if a new crypto asset is added to the scanner's universe.
const CRYPTO_COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
};

function parseNumeric(raw: string): number | null {
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface SignalVerificationInput {
  asset: string;
  market: "Stocks" | "Crypto";
  direction: "Long" | "Short";
  entry: string;
  isOption: boolean;
  createdAt: Date;
}

export interface SignalVerificationResult {
  verifiable: true;
  bestPrice: number;
  bestMovePercent: number;
  lastCheckedPrice: number;
  lastCheckedMovePercent: number;
  hitTarget: boolean;
  checkedAt: Date;
}

export interface SignalVerificationFailure {
  verifiable: false;
  reason: string;
}

/**
 * Walks daily bars for `signal.asset` since it was called and finds the
 * best favorable move (day's high for a Long, day's low for a Short) —
 * matching real-world "did this call play out" semantics: a call that
 * spiked 25% intraday and pulled back to 5% by today should still read as
 * having done 25%, not 5%. Only works for plain Stocks/Crypto spot calls —
 * options/LEAPS premium isn't something this app has historical pricing
 * for, so those always come back non-verifiable and need a manual mark
 * (see routes/signals.ts's PATCH /:id accepting resultTag/resultPercent
 * directly).
 */
export async function verifySignalMove(
  signal: SignalVerificationInput,
  targetPercent: number = SCOREBOARD_TARGET_PERCENT,
): Promise<SignalVerificationResult | SignalVerificationFailure> {
  if (signal.isOption) {
    return {
      verifiable: false,
      reason: "Options/LEAPS signals can't be auto-verified against the underlying's price history — mark the result manually.",
    };
  }

  const entryNum = parseNumeric(signal.entry);
  if (entryNum === null) {
    return {
      verifiable: false,
      reason: `Entry "${signal.entry}" isn't a plain price — mark the result manually.`,
    };
  }

  const daysSince = Math.max(3, Math.ceil((Date.now() - signal.createdAt.getTime()) / (24 * 60 * 60 * 1000)) + 2);

  let bars;
  if (signal.market === "Crypto") {
    const coingeckoId = CRYPTO_COINGECKO_IDS[signal.asset.toUpperCase()];
    if (!coingeckoId) {
      return {
        verifiable: false,
        reason: `"${signal.asset}" isn't a tracked crypto asset — mark the result manually.`,
      };
    }
    bars = await fetchCryptoDailyBars(coingeckoId, daysSince);
  } else {
    bars = await fetchStockDailyBars(signal.asset, daysSince, "stocks");
  }

  const sinceDate = signal.createdAt.toISOString().slice(0, 10);
  const relevant = bars.filter((b) => b.date >= sinceDate);
  if (relevant.length === 0) {
    return {
      verifiable: false,
      reason: "No price history since this signal was called yet — try again after today's close.",
    };
  }

  const isLong = signal.direction === "Long";
  const bestExtreme = isLong
    ? Math.max(...relevant.map((b) => b.high))
    : Math.min(...relevant.map((b) => b.low));
  const lastBar = relevant[relevant.length - 1];

  const moveOf = (price: number) => ((isLong ? price - entryNum : entryNum - price) / entryNum) * 100;
  const bestMovePercent = Math.round(moveOf(bestExtreme) * 100) / 100;
  const lastCheckedMovePercent = Math.round(moveOf(lastBar.close) * 100) / 100;

  return {
    verifiable: true,
    bestPrice: bestExtreme,
    bestMovePercent,
    lastCheckedPrice: lastBar.close,
    lastCheckedMovePercent,
    hitTarget: bestMovePercent >= targetPercent,
    checkedAt: new Date(),
  };
}
