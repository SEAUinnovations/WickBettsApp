import type { CandleSpec } from './learningData';

/**
 * Chart Pattern Recognition Trainer data.
 *
 * Every candle sequence below is SYNTHETICALLY CONSTRUCTED, not real
 * historical price data — this sandbox has no market-data access to verify
 * a real chart against, so rather than risk mislabeling an actual historical
 * move, each snapshot is built from a hand-picked price path specifically
 * shaped to exhibit one classic reversal pattern. The `keyPointIndex` and
 * `decoyIndices` on every entry were verified programmatically (found as
 * genuine local highs/lows of the underlying path, not eyeballed) before
 * being hardcoded here, so the "ground truth" the trainer scores against is
 * guaranteed self-consistent with the candles actually rendered.
 *
 * The game's UI never claims these are live or historical quotes — the
 * mock ticker + timeframe are flavor text only, same convention as the
 * other simulator screens in lib/learningData.ts.
 */

export type PatternType = 'Head & Shoulders' | 'Double Top' | 'Double Bottom';

export interface PatternSnapshot {
  id: string;
  patternType: PatternType;
  bias: 'Bearish' | 'Bullish';
  ticker: string;
  timeframe: string;
  candles: CandleSpec[];
  /** Index into `candles` of the single point that DEFINES this pattern. */
  keyPointIndex: number;
  /** Index of other plausible-but-wrong swing points, offered as distractors. */
  decoyIndices: number[];
  /** What the key point represents, in plain language, used as the button label pool. */
  keyPointLabel: string;
  /** Correct answer to the entry-timing quiz that follows the swing-point pick. */
  correctEntryTiming: 'early' | 'retest' | 'late';
  /** Shown after both questions are answered. */
  explanation: string;
}

const headShouldersA: CandleSpec[] = [
  { bodyTop: 76.5, bodyBottom: 83.5, wickTop: 72.5, wickBottom: 87.5, bullish: true },
  { bodyTop: 68.2, bodyBottom: 75.2, wickTop: 64.2, wickBottom: 79.2, bullish: true },
  { bodyTop: 59.8, bodyBottom: 66.8, wickTop: 55.8, wickBottom: 70.8, bullish: true },
  { bodyTop: 51.5, bodyBottom: 58.5, wickTop: 47.5, wickBottom: 62.5, bullish: true },
  { bodyTop: 39, bodyBottom: 46, wickTop: 35, wickBottom: 50, bullish: true },
  { bodyTop: 26.5, bodyBottom: 33.5, wickTop: 17.5, wickBottom: 42.5, bullish: true },
  { bodyTop: 35.5, bodyBottom: 42.5, wickTop: 31.5, wickBottom: 46.5, bullish: false },
  { bodyTop: 44.5, bodyBottom: 51.5, wickTop: 35.5, wickBottom: 60.5, bullish: false },
  { bodyTop: 26.5, bodyBottom: 33.5, wickTop: 22.5, wickBottom: 37.5, bullish: true },
  { bodyTop: 8.5, bodyBottom: 15.5, wickTop: 2, wickBottom: 24.5, bullish: true },
  { bodyTop: 25.5, bodyBottom: 32.5, wickTop: 21.5, wickBottom: 36.5, bullish: false },
  { bodyTop: 42.5, bodyBottom: 49.5, wickTop: 33.5, wickBottom: 58.5, bullish: false },
  { bodyTop: 34.5, bodyBottom: 41.5, wickTop: 30.5, wickBottom: 45.5, bullish: true },
  { bodyTop: 26.5, bodyBottom: 33.5, wickTop: 17.5, wickBottom: 42.5, bullish: true },
  { bodyTop: 36.5, bodyBottom: 43.5, wickTop: 32.5, wickBottom: 47.5, bullish: false },
  { bodyTop: 46.5, bodyBottom: 53.5, wickTop: 42.5, wickBottom: 57.5, bullish: false },
  { bodyTop: 56.5, bodyBottom: 63.5, wickTop: 52.5, wickBottom: 67.5, bullish: false },
  { bodyTop: 66.5, bodyBottom: 73.5, wickTop: 62.5, wickBottom: 77.5, bullish: false },
];

const headShouldersB: CandleSpec[] = [
  { bodyTop: 81.5, bodyBottom: 88.5, wickTop: 77.5, wickBottom: 92.5, bullish: true },
  { bodyTop: 69, bodyBottom: 76, wickTop: 65, wickBottom: 80, bullish: true },
  { bodyTop: 56.5, bodyBottom: 63.5, wickTop: 52.5, wickBottom: 67.5, bullish: true },
  { bodyTop: 40.5, bodyBottom: 47.5, wickTop: 36.5, wickBottom: 51.5, bullish: true },
  { bodyTop: 24.5, bodyBottom: 31.5, wickTop: 15.5, wickBottom: 40.5, bullish: true },
  { bodyTop: 35.5, bodyBottom: 42.5, wickTop: 31.5, wickBottom: 46.5, bullish: false },
  { bodyTop: 46.5, bodyBottom: 53.5, wickTop: 37.5, wickBottom: 62.5, bullish: false },
  { bodyTop: 32.5, bodyBottom: 39.5, wickTop: 28.5, wickBottom: 43.5, bullish: true },
  { bodyTop: 18.5, bodyBottom: 25.5, wickTop: 14.5, wickBottom: 29.5, bullish: true },
  { bodyTop: 4.5, bodyBottom: 11.5, wickTop: 2, wickBottom: 20.5, bullish: true },
  { bodyTop: 18.5, bodyBottom: 25.5, wickTop: 14.5, wickBottom: 29.5, bullish: false },
  { bodyTop: 32.5, bodyBottom: 39.5, wickTop: 28.5, wickBottom: 43.5, bullish: false },
  { bodyTop: 46.5, bodyBottom: 53.5, wickTop: 37.5, wickBottom: 62.5, bullish: false },
  { bodyTop: 35, bodyBottom: 42, wickTop: 31, wickBottom: 46, bullish: true },
  { bodyTop: 23.5, bodyBottom: 30.5, wickTop: 14.5, wickBottom: 39.5, bullish: true },
  { bodyTop: 36, bodyBottom: 43, wickTop: 32, wickBottom: 47, bullish: false },
  { bodyTop: 48.5, bodyBottom: 55.5, wickTop: 44.5, wickBottom: 59.5, bullish: false },
  { bodyTop: 59.5, bodyBottom: 66.5, wickTop: 55.5, wickBottom: 70.5, bullish: false },
  { bodyTop: 70.5, bodyBottom: 77.5, wickTop: 66.5, wickBottom: 81.5, bullish: false },
];

const doubleTopA: CandleSpec[] = [
  { bodyTop: 71.5, bodyBottom: 78.5, wickTop: 67.5, wickBottom: 82.5, bullish: true },
  { bodyTop: 57.8, bodyBottom: 64.8, wickTop: 53.8, wickBottom: 68.8, bullish: true },
  { bodyTop: 44, bodyBottom: 51, wickTop: 40, wickBottom: 55, bullish: true },
  { bodyTop: 30.3, bodyBottom: 37.3, wickTop: 26.3, wickBottom: 41.3, bullish: true },
  { bodyTop: 16.5, bodyBottom: 23.5, wickTop: 7.5, wickBottom: 32.5, bullish: true },
  { bodyTop: 25.3, bodyBottom: 32.3, wickTop: 21.3, wickBottom: 36.3, bullish: false },
  { bodyTop: 34, bodyBottom: 41, wickTop: 30, wickBottom: 45, bullish: false },
  { bodyTop: 42.8, bodyBottom: 49.8, wickTop: 38.8, wickBottom: 53.8, bullish: false },
  { bodyTop: 51.5, bodyBottom: 58.5, wickTop: 42.5, wickBottom: 67.5, bullish: false },
  { bodyTop: 43.3, bodyBottom: 50.3, wickTop: 39.3, wickBottom: 54.3, bullish: true },
  { bodyTop: 35, bodyBottom: 42, wickTop: 31, wickBottom: 46, bullish: true },
  { bodyTop: 26.8, bodyBottom: 33.8, wickTop: 22.8, wickBottom: 37.8, bullish: true },
  { bodyTop: 18.5, bodyBottom: 25.5, wickTop: 9.5, wickBottom: 34.5, bullish: true },
  { bodyTop: 29.3, bodyBottom: 36.3, wickTop: 25.3, wickBottom: 40.3, bullish: false },
  { bodyTop: 40, bodyBottom: 47, wickTop: 36, wickBottom: 51, bullish: false },
  { bodyTop: 50.8, bodyBottom: 57.8, wickTop: 46.8, wickBottom: 61.8, bullish: false },
  { bodyTop: 61.5, bodyBottom: 68.5, wickTop: 57.5, wickBottom: 72.5, bullish: false },
];

const doubleTopB: CandleSpec[] = [
  { bodyTop: 74.5, bodyBottom: 81.5, wickTop: 70.5, wickBottom: 85.5, bullish: true },
  { bodyTop: 54.5, bodyBottom: 61.5, wickTop: 50.5, wickBottom: 65.5, bullish: true },
  { bodyTop: 34.5, bodyBottom: 41.5, wickTop: 30.5, wickBottom: 45.5, bullish: true },
  { bodyTop: 14.5, bodyBottom: 21.5, wickTop: 5.5, wickBottom: 30.5, bullish: true },
  { bodyTop: 23, bodyBottom: 30, wickTop: 19, wickBottom: 34, bullish: false },
  { bodyTop: 31.5, bodyBottom: 38.5, wickTop: 27.5, wickBottom: 42.5, bullish: false },
  { bodyTop: 40, bodyBottom: 47, wickTop: 36, wickBottom: 51, bullish: false },
  { bodyTop: 48.5, bodyBottom: 55.5, wickTop: 39.5, wickBottom: 64.5, bullish: false },
  { bodyTop: 40.8, bodyBottom: 47.8, wickTop: 36.8, wickBottom: 51.8, bullish: true },
  { bodyTop: 33, bodyBottom: 40, wickTop: 29, wickBottom: 44, bullish: true },
  { bodyTop: 25.3, bodyBottom: 32.3, wickTop: 21.3, wickBottom: 36.3, bullish: true },
  { bodyTop: 17.5, bodyBottom: 24.5, wickTop: 8.5, wickBottom: 33.5, bullish: true },
  { bodyTop: 29.3, bodyBottom: 36.3, wickTop: 25.3, wickBottom: 40.3, bullish: false },
  { bodyTop: 41, bodyBottom: 48, wickTop: 37, wickBottom: 52, bullish: false },
  { bodyTop: 52.8, bodyBottom: 59.8, wickTop: 48.8, wickBottom: 63.8, bullish: false },
  { bodyTop: 64.5, bodyBottom: 71.5, wickTop: 60.5, wickBottom: 75.5, bullish: false },
];

const doubleBottomA: CandleSpec[] = [
  { bodyTop: 11.5, bodyBottom: 18.5, wickTop: 7.5, wickBottom: 22.5, bullish: true },
  { bodyTop: 28.3, bodyBottom: 35.3, wickTop: 24.3, wickBottom: 39.3, bullish: false },
  { bodyTop: 45, bodyBottom: 52, wickTop: 41, wickBottom: 56, bullish: false },
  { bodyTop: 61.8, bodyBottom: 68.8, wickTop: 57.8, wickBottom: 72.8, bullish: false },
  { bodyTop: 78.5, bodyBottom: 85.5, wickTop: 69.5, wickBottom: 94.5, bullish: false },
  { bodyTop: 69.3, bodyBottom: 76.3, wickTop: 65.3, wickBottom: 80.3, bullish: true },
  { bodyTop: 60, bodyBottom: 67, wickTop: 56, wickBottom: 71, bullish: true },
  { bodyTop: 50.8, bodyBottom: 57.8, wickTop: 46.8, wickBottom: 61.8, bullish: true },
  { bodyTop: 41.5, bodyBottom: 48.5, wickTop: 32.5, wickBottom: 57.5, bullish: true },
  { bodyTop: 50.3, bodyBottom: 57.3, wickTop: 46.3, wickBottom: 61.3, bullish: false },
  { bodyTop: 59, bodyBottom: 66, wickTop: 55, wickBottom: 70, bullish: false },
  { bodyTop: 67.8, bodyBottom: 74.8, wickTop: 63.8, wickBottom: 78.8, bullish: false },
  { bodyTop: 76.5, bodyBottom: 83.5, wickTop: 67.5, wickBottom: 92.5, bullish: false },
  { bodyTop: 62.8, bodyBottom: 69.8, wickTop: 58.8, wickBottom: 73.8, bullish: true },
  { bodyTop: 49, bodyBottom: 56, wickTop: 45, wickBottom: 60, bullish: true },
  { bodyTop: 35.3, bodyBottom: 42.3, wickTop: 31.3, wickBottom: 46.3, bullish: true },
  { bodyTop: 21.5, bodyBottom: 28.5, wickTop: 17.5, wickBottom: 32.5, bullish: true },
];

const doubleBottomB: CandleSpec[] = [
  { bodyTop: 14.5, bodyBottom: 21.5, wickTop: 10.5, wickBottom: 25.5, bullish: true },
  { bodyTop: 36.8, bodyBottom: 43.8, wickTop: 32.8, wickBottom: 47.8, bullish: false },
  { bodyTop: 59.2, bodyBottom: 66.2, wickTop: 55.2, wickBottom: 70.2, bullish: false },
  { bodyTop: 81.5, bodyBottom: 88.5, wickTop: 72.5, wickBottom: 97.5, bullish: false },
  { bodyTop: 72.3, bodyBottom: 79.3, wickTop: 68.3, wickBottom: 83.3, bullish: true },
  { bodyTop: 63, bodyBottom: 70, wickTop: 59, wickBottom: 74, bullish: true },
  { bodyTop: 53.8, bodyBottom: 60.8, wickTop: 49.8, wickBottom: 64.8, bullish: true },
  { bodyTop: 44.5, bodyBottom: 51.5, wickTop: 35.5, wickBottom: 60.5, bullish: true },
  { bodyTop: 53.3, bodyBottom: 60.3, wickTop: 49.3, wickBottom: 64.3, bullish: false },
  { bodyTop: 62, bodyBottom: 69, wickTop: 58, wickBottom: 73, bullish: false },
  { bodyTop: 70.8, bodyBottom: 77.8, wickTop: 66.8, wickBottom: 81.8, bullish: false },
  { bodyTop: 79.5, bodyBottom: 86.5, wickTop: 70.5, wickBottom: 95.5, bullish: false },
  { bodyTop: 64.3, bodyBottom: 71.3, wickTop: 60.3, wickBottom: 75.3, bullish: true },
  { bodyTop: 49, bodyBottom: 56, wickTop: 45, wickBottom: 60, bullish: true },
  { bodyTop: 33.8, bodyBottom: 40.8, wickTop: 29.8, wickBottom: 44.8, bullish: true },
  { bodyTop: 18.5, bodyBottom: 25.5, wickTop: 14.5, wickBottom: 29.5, bullish: true },
];

const HS_EXPLANATION =
  "The head is the tallest of the three peaks — that's what makes it a Head & Shoulders, not just 'three peaks in a row.' The two dips on either side of it mark the neckline. The pattern isn't confirmed until price actually breaks below that neckline; a lot of traders get faked out trying to short the right shoulder before the break happens.";
const DOUBLE_TOP_EXPLANATION =
  "The pattern confirms at the SECOND top, not the first — the first peak is just a high; it's only a Double Top once price rallies back and fails to make a new high a second time. The dip between the two tops is the neckline (support to watch for a breakdown).";
const DOUBLE_BOTTOM_EXPLANATION =
  "Mirror image of a Double Top: the pattern confirms at the SECOND low, when price fails to make a new low a second time. The bounce between the two lows is the neckline (resistance to watch for a breakout).";

export const PATTERN_SNAPSHOTS: PatternSnapshot[] = [
  {
    id: 'hs-a',
    patternType: 'Head & Shoulders',
    bias: 'Bearish',
    ticker: 'WCK4H-1',
    timeframe: '4H',
    candles: headShouldersA,
    keyPointIndex: 9,
    decoyIndices: [5, 13],
    keyPointLabel: 'the head',
    correctEntryTiming: 'retest',
    explanation: HS_EXPLANATION,
  },
  {
    id: 'hs-b',
    patternType: 'Head & Shoulders',
    bias: 'Bearish',
    ticker: 'WCKD-2',
    timeframe: 'Daily',
    candles: headShouldersB,
    keyPointIndex: 9,
    decoyIndices: [4, 14],
    keyPointLabel: 'the head',
    correctEntryTiming: 'retest',
    explanation: HS_EXPLANATION,
  },
  {
    id: 'dt-a',
    patternType: 'Double Top',
    bias: 'Bearish',
    ticker: 'WCK4H-3',
    timeframe: '4H',
    candles: doubleTopA,
    keyPointIndex: 12,
    decoyIndices: [4, 8],
    keyPointLabel: 'the second top',
    correctEntryTiming: 'retest',
    explanation: DOUBLE_TOP_EXPLANATION,
  },
  {
    id: 'dt-b',
    patternType: 'Double Top',
    bias: 'Bearish',
    ticker: 'WCKD-4',
    timeframe: 'Daily',
    candles: doubleTopB,
    keyPointIndex: 11,
    decoyIndices: [3, 7],
    keyPointLabel: 'the second top',
    correctEntryTiming: 'retest',
    explanation: DOUBLE_TOP_EXPLANATION,
  },
  {
    id: 'db-a',
    patternType: 'Double Bottom',
    bias: 'Bullish',
    ticker: 'WCK4H-5',
    timeframe: '4H',
    candles: doubleBottomA,
    keyPointIndex: 12,
    decoyIndices: [4, 8],
    keyPointLabel: 'the second bottom',
    correctEntryTiming: 'retest',
    explanation: DOUBLE_BOTTOM_EXPLANATION,
  },
  {
    id: 'db-b',
    patternType: 'Double Bottom',
    bias: 'Bullish',
    ticker: 'WCKD-6',
    timeframe: 'Daily',
    candles: doubleBottomB,
    keyPointIndex: 11,
    decoyIndices: [3, 7],
    keyPointLabel: 'the second bottom',
    correctEntryTiming: 'retest',
    explanation: DOUBLE_BOTTOM_EXPLANATION,
  },
];
