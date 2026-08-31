import type { Ionicons } from '@expo/vector-icons';
import type { DiagramKind } from '@/components/LessonDiagram';

/**
 * Content + data model for the Learning tab (the academy). Ported from the
 * (now-retired) wick-betts web app's Learning feature — same copy, same
 * candlestick geometry, same trivia bank, same duration-verified YouTube
 * suggestions — restructured as plain data so it can render natively with
 * react-native-svg + Text/View instead of raw JSX/HTML.
 */

export type LearningLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export const LEARNING_LEVELS: LearningLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

// ── Specializations ──────────────────────────────────────────────────────────
// A second, orthogonal filter on top of the Beginner→Expert tracks: once a
// member has the fundamentals down, they can lean into the market they
// actually want to trade. Foundational modules (no `specialization` tag)
// always show regardless of which one is selected; tagged modules — lessons
// AND games — only show for their own specialization or when "All" is active.
export type Specialization = 'stocks' | 'options' | 'futures' | 'crypto' | 'funded';

export interface SpecializationInfo {
  id: Specialization;
  label: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SPECIALIZATIONS: SpecializationInfo[] = [
  { id: 'stocks', label: 'Stocks & Swing', tagline: 'Chart reading, candlesticks, and holding through the move.', icon: 'trending-up-outline' },
  { id: 'options', label: 'Options', tagline: 'Greeks, strike selection, and time decay.', icon: 'options-outline' },
  { id: 'futures', label: 'Futures', tagline: 'Fast, leveraged, and built for reading bias quickly.', icon: 'speedometer-outline' },
  { id: 'crypto', label: 'Crypto', tagline: '24/7 markets and volatility most traders never see.', icon: 'logo-bitcoin' },
  { id: 'funded', label: 'Funded Accounts', tagline: 'Prop firm evaluations, payouts, and the discipline to keep a funded account.', icon: 'briefcase-outline' },
];

// ── Candlestick data + glyph geometry ───────────────────────────────────────
export interface CandleSpec {
  bodyTop: number;
  bodyBottom: number;
  wickTop: number;
  wickBottom: number;
  bullish: boolean;
}

export interface CandlePattern {
  id: string;
  name: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  role: string;
  meaning: string;
  candles: CandleSpec[];
}

export const CANDLE_PATTERNS: CandlePattern[] = [
  { id: 'doji', name: 'Doji', bias: 'Neutral', role: 'Indecision', meaning: 'Open and close land almost on top of each other. Neither side won the session — often a pause before the next move, especially after a strong trend.', candles: [{ bodyTop: 48, bodyBottom: 52, wickTop: 8, wickBottom: 92, bullish: true }] },
  { id: 'hammer', name: 'Hammer', bias: 'Bullish', role: 'Reversal (after a downtrend)', meaning: 'A small body sits near the top with a long lower wick. Sellers pushed price down hard, but buyers stepped in and drove it back up — a possible bottom.', candles: [{ bodyTop: 14, bodyBottom: 34, wickTop: 8, wickBottom: 90, bullish: true }] },
  { id: 'inverted-hammer', name: 'Inverted Hammer', bias: 'Bullish', role: 'Reversal (after a downtrend)', meaning: 'A small body sits near the bottom with a long upper wick. Buyers tested higher ground — the next candle needs to confirm before you trust it.', candles: [{ bodyTop: 66, bodyBottom: 86, wickTop: 10, wickBottom: 92, bullish: true }] },
  { id: 'hanging-man', name: 'Hanging Man', bias: 'Bearish', role: 'Reversal (after an uptrend)', meaning: 'The same shape as a Hammer — small body up top, long lower wick — but it shows up after an uptrend, warning that sellers are starting to probe the lows.', candles: [{ bodyTop: 14, bodyBottom: 34, wickTop: 8, wickBottom: 90, bullish: false }] },
  { id: 'shooting-star', name: 'Shooting Star', bias: 'Bearish', role: 'Reversal (after an uptrend)', meaning: 'A small body near the bottom with a long upper wick after an uptrend. Buyers reached for new highs and got firmly rejected.', candles: [{ bodyTop: 66, bodyBottom: 86, wickTop: 10, wickBottom: 92, bullish: false }] },
  { id: 'spinning-top', name: 'Spinning Top', bias: 'Neutral', role: 'Indecision', meaning: 'A small body with wicks of similar length on both sides — a tug-of-war between buyers and sellers that ended in a draw.', candles: [{ bodyTop: 42, bodyBottom: 58, wickTop: 15, wickBottom: 85, bullish: true }] },
  { id: 'marubozu-bull', name: 'Bullish Marubozu', bias: 'Bullish', role: 'Continuation / strong conviction', meaning: 'A candle with almost no wicks at all — buyers were in full control from the open to the close. Strong conviction, often a continuation signal.', candles: [{ bodyTop: 8, bodyBottom: 92, wickTop: 8, wickBottom: 92, bullish: true }] },
  { id: 'marubozu-bear', name: 'Bearish Marubozu', bias: 'Bearish', role: 'Continuation / strong conviction', meaning: 'The mirror image of a Bullish Marubozu — sellers ran the session start to finish with barely a wick to show for it.', candles: [{ bodyTop: 8, bodyBottom: 92, wickTop: 8, wickBottom: 92, bullish: false }] },
  { id: 'bull-engulf', name: 'Bullish Engulfing', bias: 'Bullish', role: 'Reversal (2-candle)', meaning: 'A small down candle gets completely swallowed by a much bigger up candle. Buyers overwhelmed the prior selling — a classic bottoming signal.', candles: [{ bodyTop: 40, bodyBottom: 58, wickTop: 34, wickBottom: 64, bullish: false }, { bodyTop: 16, bodyBottom: 80, wickTop: 10, wickBottom: 86, bullish: true }] },
  { id: 'bear-engulf', name: 'Bearish Engulfing', bias: 'Bearish', role: 'Reversal (2-candle)', meaning: 'A small up candle gets completely swallowed by a much bigger down candle — sellers just seized control of the session.', candles: [{ bodyTop: 40, bodyBottom: 58, wickTop: 34, wickBottom: 64, bullish: true }, { bodyTop: 16, bodyBottom: 80, wickTop: 10, wickBottom: 86, bullish: false }] },
  { id: 'piercing-line', name: 'Piercing Line', bias: 'Bullish', role: 'Reversal (2-candle)', meaning: "A down candle is followed by an up candle that opens below the prior low but closes back above the prior candle's midpoint — a strong bounce.", candles: [{ bodyTop: 20, bodyBottom: 55, wickTop: 14, wickBottom: 60, bullish: false }, { bodyTop: 22, bodyBottom: 72, wickTop: 16, wickBottom: 78, bullish: true }] },
  { id: 'dark-cloud', name: 'Dark Cloud Cover', bias: 'Bearish', role: 'Reversal (2-candle)', meaning: 'An up candle is followed by a down candle that opens above the prior high but closes back below its midpoint — momentum stalling hard.', candles: [{ bodyTop: 45, bodyBottom: 80, wickTop: 40, wickBottom: 86, bullish: true }, { bodyTop: 28, bodyBottom: 78, wickTop: 22, wickBottom: 84, bullish: false }] },
  { id: 'morning-star', name: 'Morning Star', bias: 'Bullish', role: 'Reversal (3-candle)', meaning: 'A strong sell-off, a small pause candle, then a strong rally that closes well back into the first candle\'s range — a textbook bottom.', candles: [{ bodyTop: 14, bodyBottom: 74, wickTop: 8, wickBottom: 80, bullish: false }, { bodyTop: 76, bodyBottom: 84, wickTop: 70, wickBottom: 90, bullish: true }, { bodyTop: 20, bodyBottom: 70, wickTop: 14, wickBottom: 76, bullish: true }] },
  { id: 'evening-star', name: 'Evening Star', bias: 'Bearish', role: 'Reversal (3-candle)', meaning: 'A strong rally, a small pause candle, then a strong sell-off that closes well back into the first candle\'s range — the mirror of a Morning Star.', candles: [{ bodyTop: 20, bodyBottom: 80, wickTop: 14, wickBottom: 86, bullish: true }, { bodyTop: 12, bodyBottom: 20, wickTop: 6, wickBottom: 26, bullish: false }, { bodyTop: 24, bodyBottom: 84, wickTop: 18, wickBottom: 90, bullish: false }] },
  { id: 'three-soldiers', name: 'Three White Soldiers', bias: 'Bullish', role: 'Continuation / reversal (3-candle)', meaning: 'Three strong up candles in a row, each closing near its high with small wicks. Steady, broad buying pressure.', candles: [{ bodyTop: 60, bodyBottom: 86, wickTop: 56, wickBottom: 90, bullish: true }, { bodyTop: 38, bodyBottom: 64, wickTop: 34, wickBottom: 68, bullish: true }, { bodyTop: 16, bodyBottom: 42, wickTop: 12, wickBottom: 46, bullish: true }] },
  { id: 'three-crows', name: 'Three Black Crows', bias: 'Bearish', role: 'Continuation / reversal (3-candle)', meaning: 'Three strong down candles in a row, each closing near its low with small wicks — the mirror of Three White Soldiers.', candles: [{ bodyTop: 14, bodyBottom: 40, wickTop: 10, wickBottom: 44, bullish: false }, { bodyTop: 36, bodyBottom: 62, wickTop: 32, wickBottom: 66, bullish: false }, { bodyTop: 58, bodyBottom: 84, wickTop: 54, wickBottom: 88, bullish: false }] },
];

// ── Trade Bias Simulator data ─────────────────────────────────────────────────
// Only patterns with a clear directional bias make sense for a Buy/Sell call —
// Doji and Spinning Top are deliberately excluded (Neutral has no right answer).
export const DIRECTIONAL_CANDLE_PATTERNS: CandlePattern[] = CANDLE_PATTERNS.filter((p) => p.bias !== 'Neutral');

export interface MockTicker { symbol: string; name: string }

/**
 * A pool of real futures contract codes used purely as flavor text for the
 * simulator — the price and candle geometry for every round are randomly
 * generated, NOT real market data or a real quote for that contract. This is
 * surfaced explicitly in the game UI so it's never mistaken for a live feed.
 */
export const MOCK_FUTURES_TICKERS: MockTicker[] = [
  { symbol: 'ES', name: 'S&P 500 futures' },
  { symbol: 'NQ', name: 'Nasdaq 100 futures' },
  { symbol: 'YM', name: 'Dow futures' },
  { symbol: 'RTY', name: 'Russell 2000 futures' },
  { symbol: 'CL', name: 'Crude oil futures' },
  { symbol: 'GC', name: 'Gold futures' },
  { symbol: 'SI', name: 'Silver futures' },
  { symbol: 'NG', name: 'Natural gas futures' },
  { symbol: 'ZB', name: '30-year bond futures' },
  { symbol: '6E', name: 'Euro FX futures' },
];

export interface TradeSimRound {
  ticker: MockTicker;
  price: number;
  pattern: CandlePattern;
}

/** Builds `n` randomized, non-real practice rounds for the Trade Bias Simulator. */
export function buildTradeSimRounds(n: number): TradeSimRound[] {
  const patterns = sampleArr(DIRECTIONAL_CANDLE_PATTERNS, n);
  return patterns.map((pattern) => ({
    pattern,
    ticker: MOCK_FUTURES_TICKERS[Math.floor(Math.random() * MOCK_FUTURES_TICKERS.length)],
    price: Math.round((50 + Math.random() * 4950) * 100) / 100,
  }));
}

// ── Options Strike & Greeks Lab data ────────────────────────────────────────
// A pool of well-known equity tickers used purely as flavor text — same rule
// as the futures pool above: every price and Greek shown in the game is
// randomly generated for practice, NOT a real quote or a real options chain.
export const MOCK_EQUITY_TICKERS: MockTicker[] = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF' },
];

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface MockStrike {
  moneyness: Moneyness;
  label: string;
  delta: number;
  theta: number;
  premium: number;
}

interface OptionsGoal {
  id: 'leverage' | 'stocklike' | 'balanced';
  label: string;
  detail: string;
  correctMoneyness: Moneyness;
  explanation: string;
}

/**
 * Three recurring trader "goals" — each one has exactly one right strike
 * given a simplified, teaching-only model of Delta/Theta/premium. This is
 * deliberately not full Black-Scholes; it is built to make the ITM/ATM/OTM
 * tradeoff intuitive for someone learning options for the first time.
 */
const OPTIONS_GOALS: OptionsGoal[] = [
  {
    id: 'leverage',
    label: 'Maximum leverage, minimum capital',
    detail: "You expect a fast, big move and want the cheapest possible way to bet on it — you're fine with a high chance this expires worthless if you're wrong.",
    correctMoneyness: 'OTM',
    explanation: 'The OTM strike has the lowest premium and the lowest Delta, so it costs the least and swings hardest in percentage terms if the move happens — but it also carries the highest odds of expiring worthless.',
  },
  {
    id: 'stocklike',
    label: 'Move almost like the stock itself',
    detail: "You want the option to track the underlying closely, even if that means paying more up front — you're not trying to squeeze out extra leverage.",
    correctMoneyness: 'ITM',
    explanation: 'The ITM strike carries a high Delta, so it behaves closer to owning the stock outright — more expensive, but far less sensitive to time decay and far less likely to expire worthless.',
  },
  {
    id: 'balanced',
    label: 'The 50/50 coin-flip strike',
    detail: 'You want the classic at-the-money bet — roughly even odds either way — and you accept that this is the strike that bleeds Theta the fastest.',
    correctMoneyness: 'ATM',
    explanation: 'The ATM strike sits with a Delta near 0.50 — the textbook coin-flip — but it also decays fastest of the three per day, since it has the most time-value on the line.',
  },
];

export interface OptionsRound {
  id: string;
  ticker: MockTicker;
  price: number;
  callOrPut: 'Call' | 'Put';
  goalLabel: string;
  goalDetail: string;
  strikes: MockStrike[];
  correctMoneyness: Moneyness;
  explanation: string;
}

/** Builds `n` randomized, non-real practice rounds for the Options Strike & Greeks Lab. */
export function buildOptionsRounds(n: number): OptionsRound[] {
  const pool: OptionsGoal[] = [];
  while (pool.length < n) pool.push(...shuffleArr(OPTIONS_GOALS));
  const jitter = (base: number, pct: number) => Math.round(base * (1 + (Math.random() - 0.5) * pct) * 100) / 100;

  return pool.slice(0, n).map((goal, i) => {
    const ticker = MOCK_EQUITY_TICKERS[Math.floor(Math.random() * MOCK_EQUITY_TICKERS.length)];
    const price = Math.round((40 + Math.random() * 260) * 100) / 100;
    const callOrPut: 'Call' | 'Put' = Math.random() > 0.5 ? 'Call' : 'Put';
    const distance = Math.max(2, Math.round(price * 0.08));
    const itmStrike = callOrPut === 'Call' ? Math.round(price - distance) : Math.round(price + distance);
    const otmStrike = callOrPut === 'Call' ? Math.round(price + distance) : Math.round(price - distance);
    const atmStrike = Math.round(price);

    const strikes: MockStrike[] = [
      { moneyness: 'ITM', label: `$${itmStrike} strike`, delta: jitter(0.74, 0.1), theta: -jitter(0.06, 0.2), premium: jitter(price * 0.15, 0.2) },
      { moneyness: 'ATM', label: `$${atmStrike} strike`, delta: jitter(0.50, 0.06), theta: -jitter(0.11, 0.15), premium: jitter(price * 0.055, 0.2) },
      { moneyness: 'OTM', label: `$${otmStrike} strike`, delta: jitter(0.24, 0.2), theta: -jitter(0.03, 0.25), premium: jitter(price * 0.018, 0.25) },
    ];

    return {
      id: `${ticker.symbol}-${i}-${Math.floor(Math.random() * 1e6)}`,
      ticker,
      price,
      callOrPut,
      goalLabel: goal.label,
      goalDetail: goal.detail,
      strikes,
      correctMoneyness: goal.correctMoneyness,
      explanation: goal.explanation,
    };
  });
}

// ── Funded Combine Prep data ────────────────────────────────────────────────
// An optional practice run at the discipline a real futures evaluation
// demands: grow a paper account by $3,000 — the same profit target used
// industry-wide on a $50,000 futures evaluation — without ever letting
// equity touch a $2,000 trailing drawdown floor. Every ticker, price,
// candle, and outcome is randomly generated for practice — not a real
// quote, a real fill, or a real prop-firm account.
export const FUNDED_PROFIT_TARGET = 3000;
export const FUNDED_MAX_DRAWDOWN = 2000;
export const FUNDED_MAX_DAYS = 20;
export const FUNDED_WIN_RATE = 0.56;
export const FUNDED_REWARD_MULTIPLE = 1.6;

export type RiskTier = 'Conservative' | 'Standard' | 'Aggressive';

export interface RiskTierSpec {
  tier: RiskTier;
  pctOfCushion: number;
  blurb: string;
}

/**
 * Risk sized as a percentage of the CURRENT drawdown cushion (equity minus
 * the trailing floor), not a fixed dollar amount — the exact framework
 * taught in the Risk Management for Funded Traders lesson.
 */
export const RISK_TIERS: RiskTierSpec[] = [
  { tier: 'Conservative', pctOfCushion: 0.05, blurb: 'A small, steady bite of your cushion — slow, and hard to blow up.' },
  { tier: 'Standard', pctOfCushion: 0.12, blurb: 'A balanced bite of your cushion.' },
  { tier: 'Aggressive', pctOfCushion: 0.25, blurb: 'A big bite — the fastest path to the target, and to a breach.' },
];

/** Dollar risk for a tier given the current cushion, clamped to a sane $25–$600 range. */
export function riskAmountForTier(tier: RiskTierSpec, cushion: number): number {
  const raw = cushion * tier.pctOfCushion;
  return Math.max(25, Math.min(600, Math.round(raw)));
}

export interface FundedDaySetup {
  day: number;
  ticker: MockTicker;
  price: number;
  pattern: CandlePattern;
}

/** Builds a randomized sequence of `n` mock trading-day setups for the Funded Combine Prep simulator. */
export function buildFundedDays(n: number): FundedDaySetup[] {
  const pool: CandlePattern[] = [];
  while (pool.length < n) pool.push(...shuffleArr(DIRECTIONAL_CANDLE_PATTERNS));
  return pool.slice(0, n).map((pattern, i) => ({
    day: i + 1,
    pattern,
    ticker: MOCK_FUTURES_TICKERS[Math.floor(Math.random() * MOCK_FUTURES_TICKERS.length)],
    price: Math.round((50 + Math.random() * 4950) * 100) / 100,
  }));
}

/** Resolves one simulated trading day at the fixed practice win rate — the point is the sizing decision, not predicting the outcome. */
export function resolveFundedDay(riskAmount: number): { won: boolean; pnl: number } {
  const won = Math.random() < FUNDED_WIN_RATE;
  const pnl = won ? Math.round(riskAmount * FUNDED_REWARD_MULTIPLE) : -riskAmount;
  return { won, pnl };
}

// ── Trivia bank ──────────────────────────────────────────────────────────────
export interface TriviaQuestion { id: string; question: string; options: string[]; correct: string }

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { id: 'q1', question: 'What does the S&P 500 track?', options: ['500 large U.S. companies', '30 major U.S. companies', 'All Nasdaq tech stocks', 'Global bond yields'], correct: '500 large U.S. companies' },
  { id: 'q2', question: 'A futures contract is best described as…', options: ['An agreement to buy or sell an asset at a set price on a future date', 'A share of ownership in a company', 'A loan between two brokers', 'A type of savings account'], correct: 'An agreement to buy or sell an asset at a set price on a future date' },
  { id: 'q3', question: 'Which type of stock typically comes with voting rights?', options: ['Common stock', 'Preferred stock', 'Treasury stock', 'Index stock'], correct: 'Common stock' },
  { id: 'q4', question: 'Roughly how many hours a week does the crypto market trade?', options: ['168 (24/7)', '40', '80', '120'], correct: '168 (24/7)' },
  { id: 'q5', question: 'On a candlestick, what does the wick (shadow) represent?', options: ['The high and low price reached during the session', 'The trading volume', 'The average price over 10 days', 'The bid-ask spread'], correct: 'The high and low price reached during the session' },
  { id: 'q6', question: 'A Hammer candlestick appearing after a downtrend typically signals…', options: ['A possible bullish reversal', 'A guaranteed breakout', 'A dividend payment', 'Increased leverage'], correct: 'A possible bullish reversal' },
  { id: 'q7', question: 'A Bearish Engulfing pattern forms when…', options: ["A large down candle's body completely covers the prior up candle's body", 'Three green candles appear in a row', 'Volume drops to zero', 'Price gaps up on earnings'], correct: "A large down candle's body completely covers the prior up candle's body" },
  { id: 'q8', question: 'SMA stands for…', options: ['Simple Moving Average', 'Stock Market Analysis', 'Standard Margin Account', 'Sector Momentum Alert'], correct: 'Simple Moving Average' },
  { id: 'q9', question: 'A 20-period SMA is calculated by…', options: ['Averaging the last 20 closing prices', "Adding today's high and low", 'Multiplying volume by price', 'Averaging the last 20 trading years'], correct: 'Averaging the last 20 closing prices' },
  { id: 'q10', question: 'A "Golden Cross" refers to…', options: ['A shorter-term SMA crossing above a longer-term SMA', 'A stock hitting an all-time high', 'A company issuing new shares', 'A candlestick with no wicks'], correct: 'A shorter-term SMA crossing above a longer-term SMA' },
  { id: 'q11', question: 'RSI readings above 70 are typically considered…', options: ['Overbought', 'Oversold', 'Neutral', 'Illiquid'], correct: 'Overbought' },
  { id: 'q12', question: 'In risk management, a stop-loss is…', options: ['A predefined price where you exit to limit a loss', 'A bonus paid by your broker', 'A type of dividend', 'A signal to add more size'], correct: 'A predefined price where you exit to limit a loss' },
  { id: 'q13', question: 'The Buttonwood Agreement, which led to the founding of the NYSE, is dated to…', options: ['1792', '1602', '1929', '1971'], correct: '1792' },
  { id: 'q14', question: 'The Amsterdam Stock Exchange, created in 1602, is widely considered…', options: ["The world's first modern stock exchange", 'The first U.S. commodities market', 'The first crypto exchange', 'A 20th-century invention'], correct: "The world's first modern stock exchange" },
  { id: 'q15', question: 'Which U.S. regulator was created in 1934 in response to the 1929 crash?', options: ['The SEC', 'The FDIC', 'The NYSE', 'FINRA'], correct: 'The SEC' },
  { id: 'q16', question: 'In February 1970, who became the first African American member and floor broker of the NYSE?', options: ['Joseph L. Searles III', 'John W. Rogers Jr.', 'Chris Gardner', 'Jeremiah Hamilton'], correct: 'Joseph L. Searles III' },
  { id: 'q17', question: 'Daniels & Bell, founded in 1971, was notable as…', options: ['The first Black-owned investment firm with a seat on the NYSE', 'The first crypto exchange', 'The oldest bank in New York', 'The first index fund provider'], correct: 'The first Black-owned investment firm with a seat on the NYSE' },
  { id: 'q18', question: 'John W. Rogers Jr. founded which firm in 1983?', options: ['Ariel Investments', 'Daniels & Bell', 'Gardner Rich & Co.', 'Vanguard'], correct: 'Ariel Investments' },
  { id: 'q19', question: "A 'liquidity zone' generally refers to…", options: ['A cluster of resting stop-losses and pending orders', 'A stock with no trading volume', 'A type of dividend account', 'A candlestick pattern'], correct: 'A cluster of resting stop-losses and pending orders' },
  { id: 'q20', question: 'Why does WickBetts emphasize patience above almost everything else?', options: ['Because discipline, not speed, is what keeps an edge profitable over time', 'Because slower trades pay lower commissions', 'Because patience guarantees profit', 'Because markets are only open one hour a day'], correct: 'Because discipline, not speed, is what keeps an edge profitable over time' },
  { id: 'q21', question: "An option's Delta tells you…", options: ["Roughly how much the option's price moves per $1 move in the underlying", 'How many days until expiration', 'The strike price', 'The dividend yield of the underlying'], correct: "Roughly how much the option's price moves per $1 move in the underlying" },
  { id: 'q22', question: 'An in-the-money (ITM) call option, compared to an out-of-the-money (OTM) one, typically has…', options: ['A higher Delta and a higher premium', 'A lower Delta and a higher premium', 'A higher Delta and a lower premium', 'No Delta at all'], correct: 'A higher Delta and a higher premium' },
  { id: 'q23', question: 'Theta measures…', options: ["How much value an option loses per day from time decay", "The option's sensitivity to implied volatility", 'The strike price relative to the underlying', "The option's trading volume"], correct: 'How much value an option loses per day from time decay' },
  { id: 'q24', question: 'Which strike is generally the cheapest, highest-leverage way to speculate on a big move — with the highest chance of expiring worthless?', options: ['Out-of-the-money (OTM)', 'In-the-money (ITM)', 'Deep in-the-money', 'At-the-money with 2 years to expiration'], correct: 'Out-of-the-money (OTM)' },
  // ── Strategies curriculum drill questions ──────────────────────────────────
  { id: 'q25', question: 'A Fair Value Gap (FVG) forms across…', options: ['Three candles, where the 1st and 3rd wicks do not overlap', 'A single candle with no wicks at all', 'Two candles of the same color', 'Ten candles measured over a full week'], correct: 'Three candles, where the 1st and 3rd wicks do not overlap' },
  { id: 'q26', question: 'A bullish FVG sitting below current price tends to act as…', options: ['Support if price returns to it', 'Resistance no matter what', 'A guaranteed reversal signal', 'A dividend record date'], correct: 'Support if price returns to it' },
  { id: 'q27', question: "The core idea behind trading a Fair Value Gap is…", options: ["Price is statistically drawn back to 'rebalance' an imbalanced zone", 'Gaps always fill within one candle', 'Gaps only matter on the weekly chart', 'A gap means the company is about to report earnings'], correct: "Price is statistically drawn back to 'rebalance' an imbalanced zone" },
  { id: 'q28', question: 'Scalping is best described as…', options: ['Many small, fast trades held for seconds to a few minutes', 'A single trade held for several months', 'Buying and never selling', 'A strategy only usable on illiquid stocks'], correct: 'Many small, fast trades held for seconds to a few minutes' },
  { id: 'q29', question: 'At high scalping trade frequency, one of the biggest hidden threats to profitability is…', options: ['The spread and commissions on every round-trip trade', 'Too little screen time', 'Dividend withholding tax', 'Overnight financing rates'], correct: 'The spread and commissions on every round-trip trade' },
  { id: 'q30', question: 'An Opening Range Breakout (ORB) strategy defines its key level from…', options: ["The high/low of a fixed window right after the open (e.g. the first 15 minutes)", "The prior year's high and low", 'The closing price from exactly one week ago', "The average of every candle in the entire session"], correct: "The high/low of a fixed window right after the open (e.g. the first 15 minutes)" },
  { id: 'q31', question: 'In an ORB strategy, a "retest entry" means…', options: ['Waiting for price to pull back to the broken range level before entering', 'Entering the instant the range breaks, no matter what', 'Only trading the closing 15 minutes of the day', 'Re-drawing the opening range every hour'], correct: 'Waiting for price to pull back to the broken range level before entering' },
  { id: 'q32', question: 'Why are false breakouts especially common right after the open?', options: ['Direction and volume are still being established in that volatile early window', 'Markets are technically closed for the first hour', 'Options expire every morning at 9:30', 'Volume is always at its lowest right after the open'], correct: 'Direction and volume are still being established in that volatile early window' },
  { id: 'q33', question: 'Real support and resistance are best thought of as…', options: ['A zone a few ticks wide, not one exact price', 'Always exactly one penny wide', 'Only valid on the monthly chart', 'Irrelevant once a stock IPOs'], correct: 'A zone a few ticks wide, not one exact price' },
  { id: 'q34', question: '"Role reversal" in support/resistance trading refers to…', options: ['Old resistance frequently becoming new support once broken, and vice versa', 'A stock switching stock exchanges', 'A company changing its ticker symbol', 'Support only working on down days'], correct: 'Old resistance frequently becoming new support once broken, and vice versa' },
  { id: 'q35', question: 'According to this module, a support/resistance level generally gets weaker when…', options: ['It has been tested and held many times, using up the orders resting there', 'It has never once been touched', 'It lines up with a round number', 'It sits near a 50-day moving average'], correct: 'It has been tested and held many times, using up the orders resting there' },
  { id: 'q36', question: 'VWAP stands for…', options: ['Volume Weighted Average Price', 'Very Wide Average Position', 'Value-Weighted Asset Portfolio', 'Volatility-Weighted Averaged Premium'], correct: 'Volume Weighted Average Price' },
  { id: 'q37', question: 'Unlike a simple moving average, VWAP is pulled toward…', options: ['Price levels where heavier volume traded', 'Whichever price came first each day', 'The opening price only', 'The prior day\'s closing price'], correct: 'Price levels where heavier volume traded' },
  { id: 'q38', question: 'On a strong, high-volume trend day, this module recommends…', options: ['Using VWAP as support/resistance in the direction of the trend rather than fading it', 'Always shorting any move far above VWAP', 'Ignoring VWAP entirely', 'Buying only when price closes exactly on VWAP'], correct: 'Using VWAP as support/resistance in the direction of the trend rather than fading it' },
  { id: 'q39', question: 'VWAP resets…', options: ['Every trading session', 'Once a year', 'Only when a stock splits', 'Every time volume doubles'], correct: 'Every trading session' },
  { id: 'q40', question: 'A trader who shorts every stretch above VWAP regardless of the day\'s trend is most exposed to…', options: ['Getting run over by a genuine, high-volume trend day', 'Paying too little in commissions', 'Missing dividend payments', 'Running out of overnight margin'], correct: 'Getting run over by a genuine, high-volume trend day' },
];

// ── Lesson body content model ────────────────────────────────────────────────
// Plain-data blocks so lesson content renders natively (Text/View) instead of
// HTML/JSX. `**bold**` and `_italic_` markers inside `text` fields are parsed
// by <RichText> at render time.
export type LessonBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'callout'; label: string; text: string }
  | { type: 'definitions'; items: { title: string; text: string }[] }
  | { type: 'list'; items: string[] }
  | { type: 'candles' }
  | { type: 'diagram'; kind: DiagramKind; caption?: string }
  | { type: 'timeline'; items: { year: string; text: string }[] }
  | { type: 'bios'; items: { name: string; meta: string; text: string }[] }
  | { type: 'note'; text: string }
  | { type: 'scenario'; title: string; setup: string; whatHappened: string; takeaway: string };

export interface LearningVideo { title: string; url: string; duration: string }

export interface LearningModule {
  id: string;
  level: LearningLevel;
  kind: 'lesson' | 'game';
  title: string;
  tagline: string;
  minutes: number;
  xp: number;
  icon: keyof typeof Ionicons.glyphMap;
  body?: LessonBlock[];
  /** At most 2 short (under 10 min), duration-verified YouTube videos related to this lesson. */
  videos?: LearningVideo[];
  /** Untagged modules are foundational — always visible. Tagged modules (lessons AND games) only show under their own specialization, or when "All" is selected. */
  specialization?: Specialization;
}

const bodyWelcome: LessonBlock[] = [
  { type: 'p', text: 'WickBetts is a trading community built to turn beginners into disciplined, patient traders — what the desk calls **stock market snipers**: people who wait for a clean setup instead of firing at everything that moves.' },
  { type: 'h3', text: 'Why learn to trade at all?' },
  { type: 'p', text: 'Debt, bills, and the general expense of life have a way of piling up. Trading is a skill — not a shortcut — that can move you one step closer to financial freedom, if you treat it like one.' },
  { type: 'callout', label: 'The one non-negotiable', text: '**Patience.** This is not a get-rich-quick scheme — although you can get rich quickly, it is the patient mindset underneath that actually keeps you profitable over time. Every module after this one assumes you have internalized that.' },
  { type: 'h3', text: 'What this academy covers' },
  { type: 'list', items: [
    'The core fundamentals across all four markets WickBetts trades',
    'How to read a chart before you ever place a trade',
    'A personal risk framework you can actually stick to',
    'The discipline to grow from a demo account to real capital without blowing it up',
  ] },
];

const bodyMarkets101: LessonBlock[] = [
  { type: 'p', text: 'Before you trade anything, know what you are trading. WickBetts covers four core markets — here is what each one actually is.' },
  { type: 'definitions', items: [
    { title: 'Indices', text: 'An index tracks the performance of a group of stocks to represent a market or sector. The **S&P 500** tracks 500 large U.S. companies, the **Dow Jones** tracks 30 major U.S. companies, and the **Nasdaq** is weighted toward tech.' },
    { title: 'Futures', text: 'Financial contracts to buy or sell an asset at a predetermined price on a future date — commodity futures (oil, gold, wheat) and financial futures (the S&P 500, interest rates, currencies). Used for hedging _and_ speculation. Leverage amplifies gains **and** losses.' },
    { title: 'Stocks', text: 'Stocks represent ownership in a company. Common stock carries voting rights plus dividends; preferred stock gets dividend priority but limited voting. Profit comes from price appreciation and dividends — risk comes from company performance, the economy, and sentiment.' },
    { title: 'Crypto', text: 'Digital currencies secured by blockchain technology — Bitcoin, Ethereum, Solana. Highly volatile (10%+ daily swings are not rare), not tied to a company or government, and tradable 24/7 for investment, payments, or DeFi.' },
  ] },
];

const bodyDemoToLive: LessonBlock[] = [
  { type: 'p', text: 'The best place to start is a platform like TradingView, where you can open a demo (paper trading) account and get real exposure to the market with zero real-money risk.' },
  { type: 'h3', text: 'Set a realistic starting amount' },
  { type: 'p', text: 'Pick a demo balance you would actually be comfortable trading in real life. This is where you develop a strategy that fits your own style — trade against every asset class you just learned about and watch how price and P&L actually move.' },
  { type: 'callout', label: 'A readiness checkpoint, not a promise', text: 'One rough benchmark: try to grow the account by roughly $3k without ever giving back more than $2k along the way. It is not a guarantee of anything — it is a simple, illustrative way to prove to yourself that you can be net profitable **and** control your drawdowns before a single dollar of real capital is on the line.' },
  { type: 'p', text: 'Only after that discipline shows up consistently in a demo does it make sense to size up into a live or prop-firm account.' },
  { type: 'scenario', title: 'Jumping to live too early', setup: 'A demo trader grows a $10,000 paper account to $14,000 in three weeks by sizing up aggressively after every win.', whatHappened: 'The same aggressive sizing gets carried straight into a live account. A normal losing streak — three trades in a row — wipes out 60% of the real capital before the trader steps back.', takeaway: 'A hot demo streak built on oversized bets is not the same skill as consistent, properly-sized execution. Prove the discipline first at real size (mentally), then scale up — not the other way around.' },
];

const bodyReadingTheChart: LessonBlock[] = [
  { type: 'p', text: 'Understanding the chart is the first thing to do before placing any trade — before an indicator, before a candlestick pattern, before anything else.' },
  { type: 'definitions', items: [
    { title: 'Trend', text: 'Is price bullish (climbing) or bearish (falling)? Everything else you do should agree with the answer, not fight it.' },
    { title: 'Volume', text: 'Is there a lot of it? If so, figure out when, where, and why — volume is the market telling you how much conviction is behind a move.' },
    { title: 'Timeframe', text: 'Start from the Daily (D) chart to find the higher-timeframe trend first, then drop into lower timeframes to time an entry.' },
    { title: 'Support & Resistance', text: 'Support is a price floor where buying has stepped in before; resistance is a price ceiling where selling has capped price before. Price tends to react at both.' },
  ] },
  { type: 'diagram', kind: 'trend-and-sr', caption: 'Price trending up while bouncing between a support floor and a resistance ceiling.' },
  { type: 'h3', text: 'Liquidity zones — a preview' },
  { type: 'p', text: 'A liquidity zone is an area packed with resting stop-losses and pending orders. Price is frequently drawn toward these zones before reversing — the _Liquidity & Market Structure_ module in the Advanced track goes much deeper on this.' },
  { type: 'scenario', title: 'Fighting the higher timeframe', setup: "On the 5-minute chart, a stock prints a clean bullish reversal candle at what looks like support.", whatHappened: "Zooming out to the Daily chart shows the stock is in a firm, weeks-long downtrend — that '5-minute support' was just a pause inside a much bigger slide. Price kept falling within the hour.", takeaway: 'A textbook pattern on a low timeframe means little if it fights the higher-timeframe trend. Always check the Daily chart first, the way this module opened.' },
];

const bodyCandlestickEncyclopedia: LessonBlock[] = [
  { type: 'p', text: 'Every candle is a small story: the **body** is the range between the open and close, the **color** shows whether it closed up or down, and the **wicks** (or shadows) show the high and low the price actually reached — and got rejected from — during that session.' },
  { type: 'candles' },
];

const bodyIndicatorsToolkit: LessonBlock[] = [
  { type: 'p', text: 'An indicator turns raw price into something easier to read. The one every trader learns first is the **Simple Moving Average (SMA)**.' },
  { type: 'callout', label: 'The formula', text: 'SMA(n) = (P1 + P2 + … + Pn) ÷ n — the average of the last n closing prices.' },
  { type: 'h3', text: 'Worked example' },
  { type: 'p', text: 'Five daily closes: $48, $50, $49, $52, $53. A 5-period SMA is (48+50+49+52+53) ÷ 5 = **$50.40**. Tomorrow, the oldest price drops off and the newest one is added — the average "moves."' },
  { type: 'h3', text: 'What SMA is actually used for' },
  { type: 'list', items: [
    'Reading trend direction — price holding above a rising SMA leans bullish',
    'Acting as dynamic support or resistance',
    'Smoothing out noisy day-to-day price action',
    'Crossover signals — a shorter SMA crossing above a longer one (e.g. 50 over 200) is a **Golden Cross**; crossing below is a **Death Cross**',
  ] },
  { type: 'diagram', kind: 'sma-crossover', caption: 'A shorter SMA crossing above a longer one — the Golden Cross.' },
  { type: 'h3', text: 'The rest of the toolkit' },
  { type: 'definitions', items: [
    { title: 'EMA', text: 'An Exponential Moving Average weights recent prices more heavily than an SMA, so it reacts faster to new moves.' },
    { title: 'RSI', text: 'Relative Strength Index — a 0–100 momentum gauge. Above 70 is generally considered overbought, below 30 oversold.' },
    { title: 'MACD', text: 'Moving Average Convergence Divergence — tracks the relationship between two EMAs to gauge trend and momentum together.' },
    { title: 'Volume', text: 'Confirms conviction. A move on rising volume carries more weight than the same move on a quiet tape.' },
  ] },
  { type: 'note', text: 'Indicators lag price — they describe what already happened. They work best stacked on top of the chart-reading and candlestick skills from earlier modules, not used alone.' },
  { type: 'scenario', title: 'A golden cross that fizzled', setup: 'The 50-day SMA crosses above the 200-day SMA on a stock — a textbook Golden Cross, a classic bullish signal.', whatHappened: 'Volume on the crossover day was actually below average, and price chopped sideways for the next month instead of rallying. The signal fired, but nothing was behind it.', takeaway: 'A crossover is a trigger to look closer, not a trigger to enter blind. Confirm with volume and price action before trusting an indicator signal by itself.' },
];

const bodyRiskAndPsychology: LessonBlock[] = [
  { type: 'p', text: 'An edge is only worth anything if you survive long enough to use it. That is what risk management is for.' },
  { type: 'definitions', items: [
    { title: 'Position sizing', text: 'A common starting range is risking a small, fixed slice of your account per trade — often cited around 0.5–2% — so no single loss can do lasting damage.' },
    { title: 'Define your stop first', text: 'Decide your invalidation level — the price that proves the idea wrong — before you enter, not after.' },
    { title: 'Risk / reward', text: 'Compare the distance to your target against the distance to your stop. A trade only makes sense if the reward justifies the risk.' },
    { title: 'Journal everything', text: 'Write down the setup, the reasoning, and the result. Patterns in your own behavior are the fastest thing you can learn from.' },
  ] },
  { type: 'callout', label: 'Back to Module 1', text: 'Patience is not a slogan — it is the thing that keeps you from moving your stop, doubling down after a loss, or chasing a candle you already missed. Every rule above only works if patience is doing the enforcing.' },
  { type: 'p', text: 'This is also exactly what **trade reviews** are for — bring real setups to the Community threads or a mentorship call and get a second pair of eyes before the pattern repeats.' },
  { type: 'scenario', title: 'Revenge trading after a stop-out', setup: 'A trader gets stopped out of a well-planned setup for a small, correctly-sized loss — the plan worked exactly as designed.', whatHappened: "Frustrated, they immediately re-enter the same ticker without a new setup, sized twice as large 'to make it back' — and get stopped out again, this time for real damage.", takeaway: 'The original loss was the system working. The damage came from breaking the plan to chase it back. A stop-out is information, not an insult that needs revenge.' },
];

const bodyLiquidityAndStructure: LessonBlock[] = [
  { type: 'p', text: 'Price does not move randomly toward round numbers — it is frequently drawn toward liquidity: the resting stop-losses and pending orders clustered above old highs and below old lows.' },
  { type: 'h3', text: 'Reading structure' },
  { type: 'list', items: [
    '**Uptrend structure** — a series of higher highs and higher lows',
    '**Downtrend structure** — a series of lower highs and lower lows',
    '**Break of Structure (BOS)** — price breaks the most recent swing high/low in the direction of the trend, confirming it is still intact',
    '**Change of Character (CHoCH)** — price breaks structure against the prevailing trend, an early warning the trend may be turning',
  ] },
  { type: 'diagram', kind: 'market-structure', caption: 'Higher highs and higher lows, until a Change of Character breaks the pattern.' },
  { type: 'h3', text: 'Why "obvious" levels get run first' },
  { type: 'p', text: 'The support and resistance everyone can see are exactly where the stop orders pile up. A quick move through that level to grab liquidity — a stop hunt — before reversing is one of the most common reasons a level almost holds and then does not.' },
  { type: 'scenario', title: 'A textbook stop hunt', setup: 'Price grinds up to an obvious resistance level that every chart-watcher can see, then breaks slightly above it — traders short below it get stopped out, and breakout buyers pile in.', whatHappened: "Within minutes, price reverses hard and closes back below the old resistance. The 'breakout' was really a liquidity grab, sweeping stops on both sides before the real move — down — began.", takeaway: 'The most obvious level on the chart is exactly where stops cluster. A quick wick through a level with no real follow-through is often liquidity being taken, not a genuine breakout.' },
];

const bodyFairValueGaps: LessonBlock[] = [
  { type: 'p', text: 'A Fair Value Gap (FVG) is a three-candle imbalance: the wick of the first candle and the wick of the third candle do not overlap, leaving a visible gap in price that the second, big-momentum candle blew straight through without any real two-way trading happening in between.' },
  { type: 'definitions', items: [
    { title: 'Bullish FVG', text: 'Formed during a sharp up-move — the gap sits below current price and tends to act as support if price returns to it.' },
    { title: 'Bearish FVG', text: 'Formed during a sharp down-move — the gap sits above current price and tends to act as resistance if price returns to it.' },
    { title: 'Imbalance', text: 'The core idea behind an FVG: a price range where buyers or sellers were so aggressive that the opposite side never got a fair chance to transact. Price is statistically drawn back to "rebalance" that zone.' },
    { title: 'Filling the gap', text: "When price trades back into the FVG range, it is said to be 'filled' — this does not require the entire gap to be retraced, just enough of it to react from." },
  ] },
  { type: 'diagram', kind: 'fair-value-gap', caption: 'The three-candle imbalance — a gap the middle candle blew through untraded.' },
  { type: 'h3', text: 'How the trade actually works' },
  { type: 'list', items: [
    'Identify the three-candle sequence and mark the gap between candle 1\'s wick and candle 3\'s wick',
    'Wait for price to return into that zone rather than chasing it immediately after it forms',
    'Look for a rejection — a wick, an engulfing candle, a shift in the smaller timeframe — inside the gap before entering, not just tagging the level',
    'Place the stop just beyond the far edge of the gap, since a full close through it invalidates the idea',
  ] },
  { type: 'callout', label: 'Not every gap fills, and not every fill holds', text: "An FVG is a place to pay closer attention, not an automatic trade signal. In a strong trend, price can blow through an FVG without even slowing down — treat it as one input that needs its own confirmation, the same way a support/resistance level does." },
  { type: 'scenario', title: 'Chasing the gap instead of waiting for it', setup: 'A stock rips higher, leaving a clean bullish FVG well below current price. A trader immediately buys at the current, already-extended price, reasoning the FVG proves the trend is strong.', whatHappened: "Price chops sideways for two days going nowhere, then finally pulls all the way back into the FVG zone and reacts exactly as the pattern would predict — but the trader who bought at the top is sitting on an unrealized loss the entire time, watching the setup they correctly identified play out below their own entry.", takeaway: "An FVG is a level to trade FROM once price returns to it, not a reason to buy wherever price currently is. Identifying the gap is only half the setup — patience for the retracement is the other half." },
];

const bodyScalpingStrategies: LessonBlock[] = [
  { type: 'p', text: 'Scalping is trading for small, fast profits — often in and out of a position in seconds to a few minutes — relying on a high number of trades and a tight process rather than any single big winner.' },
  { type: 'definitions', items: [
    { title: 'Holding period', text: "Seconds to low single-digit minutes, almost always closed before the session ends. There is no overnight risk in a pure scalp." },
    { title: 'Tight risk/reward', text: "Scalps commonly target a small, fixed number of ticks or cents with an equally tight stop — the edge comes from win rate and trade frequency, not from big reward-to-risk ratios." },
    { title: 'Tape reading / order flow', text: "Watching the level 2 book and time & sales print-by-print for real-time buying/selling pressure, since scalping timeframes are often too fast for standard indicators to be useful." },
    { title: 'Spread and commission drag', text: "The bid-ask spread and per-trade fees are a fixed cost paid on every single scalp — at high trade frequency, this drag can quietly erase an otherwise-profitable strategy." },
  ] },
  { type: 'h3', text: 'What scalping actually requires' },
  { type: 'list', items: [
    'A highly liquid instrument with a tight spread — illiquid names make the entry/exit cost alone unworkable at this timeframe',
    'Total, undivided focus for the full session — scalping is not a strategy you half-watch between other tasks',
    'Fast, mechanical execution and exits, since hesitation on a strategy built around small moves erases the edge almost immediately',
    'A very clear, pre-defined max-loss-per-day rule, since a high trade count means a bad session compounds quickly',
  ] },
  { type: 'note', text: "Scalping is one of the least forgiving styles for a beginner — it demands the fastest reactions and the least room for the exact hesitation and second-guessing new traders are most prone to. Many traders find it worth mastering a slower style (Swing, ORB, S/R) first." },
  { type: 'scenario', title: 'Winning the trades, losing the day', setup: 'A trader scalps 40 small trades in a session with a 65% win rate — a genuinely strong hit rate by most standards.', whatHappened: "Spread and commission costs on 40 round-trip trades quietly add up to more than the net edge the strategy produced. The trader finishes the day roughly flat despite 'winning' most of the individual trades.", takeaway: 'At scalping frequency, transaction costs are not a rounding error — they are a real, recurring opponent that has to be beaten in addition to the market itself.' },
];

const bodyOpeningRangeBreakout: LessonBlock[] = [
  { type: 'p', text: 'Opening Range Breakout (ORB) defines a price range from the first few minutes of the session — commonly 5, 15, or 30 minutes — then trades a break above or below that range as the signal.' },
  { type: 'definitions', items: [
    { title: 'Opening range', text: "The high and low printed during a fixed window right after the open (e.g. 9:30–9:45 AM Eastern for a 15-minute ORB) — this range becomes the reference level for the rest of the setup." },
    { title: 'Breakout entry', text: "A trade taken the moment price closes above the range high (long) or below the range low (short), on the idea that the opening range reflects the first real tug-of-war of the day, and a decisive break shows who won it." },
    { title: 'Retest entry', text: "A more patient variant: wait for price to break the range, then pull back to retest the broken level as new support/resistance before entering — trading the confirmation instead of the first breakout print." },
    { title: 'False breakout', text: "Price breaks the range, triggers ORB entries, then reverses back inside it — extremely common in the first hour when volume and direction are still being established." },
  ] },
  { type: 'h3', text: 'Why the opening range matters' },
  { type: 'p', text: 'The open concentrates overnight news, pre-market positioning, and the first scheduled economic data of the day into one short, high-volume window. A range that holds through that chaos and then gets decisively broken carries more information than a random breakout later in a quiet afternoon.' },
  { type: 'diagram', kind: 'orb', caption: 'A breakout above the opening range, established in the first minutes of the session.' },
  { type: 'callout', label: 'Breakout vs. retest is a real tradeoff', text: "Trading the immediate breakout gets a better entry price but eats more false signals. Waiting for a retest cuts down on fakeouts but means missing some breakouts that never look back — pick one approach deliberately rather than switching mid-session based on how the last trade went." },
  { type: 'scenario', title: 'The 9:35 fakeout', setup: 'A stock breaks decisively above its 15-minute opening range at 9:47 AM on rising volume — a clean ORB long signal by the book.', whatHappened: "Price reverses within four minutes and closes back inside the range, stopping out the breakout entry for a small loss — a classic false breakout during the still-volatile first half hour of the session.", takeaway: "ORB works because the opening range is meaningful, not because every breakout of it succeeds. A stop just inside the range, sized for the instrument's normal opening volatility, is what makes the strategy survivable through the false breakouts that are a normal part of it." },
];

const bodySupportResistanceTrading: LessonBlock[] = [
  { type: 'p', text: 'Every trader can point at an obvious support or resistance line — trading it well is a different skill from just seeing it. This module goes past the "Reading the Chart" basics into how support/resistance is actually used as a repeatable strategy.' },
  { type: 'definitions', items: [
    { title: 'Zone, not a line', text: "Real support and resistance are rarely a single exact price — they are a zone a few ticks or points wide, since different participants place orders at slightly different levels around the same idea." },
    { title: 'Wicks vs. closes', text: "Deciding whether a level 'held' based on candle wicks (more forgiving, catches every touch) versus candle closes (stricter, filters out quick wick-throughs) is a real methodology choice that changes how many valid touches a level shows." },
    { title: 'Role reversal', text: "Old resistance frequently becomes new support once broken, and vice versa — the same order-flow logic that made the level matter in the first place doesn't disappear just because price broke through it once." },
    { title: 'Confluence', text: "A support/resistance level lining up with a round number, a moving average, or a prior swing point is meaningfully stronger evidence than any one of those in isolation." },
  ] },
  { type: 'diagram', kind: 'support-resistance-zone', caption: 'Rejected touches, then a break and retest that flips the zone from resistance to support.' },
  { type: 'h3', text: 'A repeatable S/R trade' },
  { type: 'list', items: [
    'Mark zones from clear prior swing highs/lows, not every minor wiggle on the chart',
    'Wait for price to actually reach the zone rather than anticipating it early',
    'Look for a reaction — a rejection candle, a volume spike, a smaller-timeframe reversal — inside the zone before entering',
    'Place the stop just past the far side of the zone, so a genuine break invalidates the trade rather than getting shaken out by normal noise inside it',
  ] },
  { type: 'callout', label: 'The more times a level is tested, the weaker it gets', text: "This runs against most beginners' intuition. A level that has been tested and held five times has also been probed five times — eventually the orders resting there get used up, and the level breaks. A fresh, untested level is often more reliable than a heavily-touched one." },
  { type: 'scenario', title: 'Role reversal in action', setup: 'A stock struggles for weeks under a clear resistance level at $50, getting rejected on four separate touches.', whatHappened: 'Price finally breaks and closes decisively above $50 on strong volume. Two days later it pulls back down to retest that same $50 level from above — and it holds as support on the first touch, exactly as the role-reversal idea predicts.', takeaway: 'A broken level does not stop mattering — it frequently just switches sides. The retest of old resistance as new support is one of the highest-quality, most repeatable entries in this style of trading.' },
];

const bodyVwapReversion: LessonBlock[] = [
  { type: 'p', text: 'VWAP — Volume Weighted Average Price — is the average price a security has traded at today, weighted by volume at each price level. It resets every session and is one of the most closely watched intraday levels on the desk, especially among institutional traders.' },
  { type: 'definitions', items: [
    { title: 'VWAP', text: "A running, volume-weighted average of the day's trading, recalculated continuously through the session. Unlike a simple moving average, a price level with heavier volume behind it pulls VWAP toward it more than a quiet price level does." },
    { title: 'Why institutions watch it', text: "Many large funds are measured against VWAP as an execution benchmark — filling an order better than VWAP is considered a good fill. That built-in institutional attention is part of why price so often reacts around it." },
    { title: 'Mean-reversion approach', text: "Trading the idea that price has stretched too far from VWAP and is likely to snap back toward it — buying when price is unusually far below VWAP, selling when unusually far above." },
    { title: 'Trend-following approach', text: "The opposite read of the same level: treating a strong, sustained move away from VWAP (especially with rising volume) as a real trend, using VWAP itself as a trailing support/resistance reference rather than a magnet to revert to." },
    { title: 'Standard deviation bands', text: "Bands plotted a fixed number of standard deviations above and below VWAP, used to gauge how statistically stretched the current move away from VWAP actually is." },
  ] },
  { type: 'diagram', kind: 'vwap-reversion', caption: 'Price stretching away from VWAP, then reverting back to it.' },
  { type: 'h3', text: 'Reversion and trend-following are opposites — know which one you are trading' },
  { type: 'p', text: "The single most common mistake with VWAP is not picking one of these two approaches and sticking with it for the trade. Fading a move back toward VWAP while a genuine, high-volume trend is underway is fighting real conviction in the market — and buying a 'reversion' bounce off VWAP during a strong trend day is really just trading with the trend by accident." },
  { type: 'callout', label: 'Read the day\'s character first', text: "A choppy, rangebound session rewards fading stretched moves back to VWAP. A strong trend day rewards using VWAP as support/resistance in the direction of the trend instead. Decide which kind of day it looks like before picking the strategy, not after the trade is already open." },
  { type: 'scenario', title: 'Fading a trend day', setup: 'A stock gaps up on major news and grinds steadily higher through the morning, trading well above VWAP with strong, consistent volume the entire time.', whatHappened: "A trader shorts the stretch above VWAP expecting reversion, gets stopped out on the first attempt, and shorts again at an even higher price with the same reasoning — getting stopped out a second time as the trend continues.", takeaway: 'A large, volume-backed move away from VWAP on real news is often the market re-rating the stock, not a stretched rubber band waiting to snap back. VWAP reversion works best on quieter, rangebound days — not against a trending one driven by a real catalyst.' },
];

const bodyOptionsBasics: LessonBlock[] = [
  { type: 'p', text: 'An option is a contract, not a share — it gives you the right, but not the obligation, to buy or sell a stock at a set price before a set date. That single idea unlocks a completely different way to express an opinion on a chart.' },
  { type: 'definitions', items: [
    { title: 'Call', text: 'The right to buy the stock at the strike price. Bought when you expect price to go up.' },
    { title: 'Put', text: 'The right to sell the stock at the strike price. Bought when you expect price to go down.' },
    { title: 'Strike price', text: 'The fixed price written into the contract — the level everything else is measured against.' },
    { title: 'Expiration', text: 'The date the contract stops existing. After this, it is either exercised, closed out, or it expires worthless.' },
    { title: 'Premium', text: 'What you actually pay to own the option — quoted per share, but each standard contract controls 100 shares.' },
  ] },
  { type: 'h3', text: 'ITM, ATM, and OTM — the strike decision' },
  { type: 'list', items: [
    '**In-the-money (ITM)** — the strike is already favorable versus the current price. Highest premium, but the most "stock-like" behavior.',
    '**At-the-money (ATM)** — the strike sits right at the current price. The classic 50/50 bet, and the strike that decays fastest.',
    '**Out-of-the-money (OTM)** — the strike is not yet favorable. Cheapest premium, most leverage, and the highest chance of expiring completely worthless.',
  ] },
  { type: 'diagram', kind: 'options-payoff', caption: 'Payoff shape at expiration for a long call versus a long put.' },
  { type: 'callout', label: 'Why the strike matters more than the direction', text: "Getting the direction right is only half the trade. Pick a strike that does not fit your actual goal — expecting a slow grind but buying a cheap OTM lotto strike, say — and you can be completely right on direction and still lose money to time decay before the move shows up." },
  { type: 'scenario', title: 'Right on direction, wrong on strike', setup: 'A trader is confident a stock will grind slowly higher over the next month and buys a far OTM call because it is cheap.', whatHappened: 'The stock does grind higher, exactly as predicted — but slowly. Time decay eats the cheap OTM option faster than the slow move can add value, and it expires worthless despite the correct call on direction.', takeaway: "A cheap strike is not a shortcut — it is a different bet entirely, one that needs a fast, large move to pay off. Matching the strike to the expected speed and size of the move matters as much as the direction itself." },
];

const bodyGreeksInPractice: LessonBlock[] = [
  { type: 'p', text: 'The "Greeks" are a set of numbers every options platform shows next to a contract — each one measures a different way the option\'s price can move. You do not need advanced math to use them, just a working sense of what each one is telling you.' },
  { type: 'definitions', items: [
    { title: 'Delta', text: "Roughly how much the option's price moves per $1 move in the underlying stock. A 0.50 Delta call gains about $0.50 when the stock gains $1." },
    { title: 'Theta', text: 'How much value the option loses per day purely from time passing — time decay. Every option is losing a little value to Theta every single day, even if the stock does not move.' },
    { title: 'Gamma', text: "How fast Delta itself changes as the stock moves. It's highest for at-the-money options — which is part of why ATM options feel so twitchy near expiration." },
    { title: 'Vega', text: "How much the option's price moves for a 1% change in implied volatility — why options can jump or crash in value around earnings even if the stock barely moves." },
  ] },
  { type: 'h3', text: 'How strike choice moves every Greek at once' },
  { type: 'list', items: [
    '**ITM** — higher Delta (moves more like the stock), slower Theta decay, higher premium at risk',
    '**ATM** — Delta near 0.50, the fastest Theta decay of the three, and the highest Gamma',
    '**OTM** — lowest Delta, cheapest premium, and the highest odds of expiring worthless if the move does not arrive in time',
  ] },
  { type: 'callout', label: 'The one habit that matters most', text: "Before opening any options trade, know your goal — cheap leverage on a big expected move, stock-like exposure, or the balanced coin-flip — and let that goal pick the strike. Never pick the strike first and reverse-engineer a reason for it." },
  { type: 'scenario', title: 'The earnings Vega crush', setup: 'A trader buys an ATM call the day before earnings, correctly predicting the stock will jump on the report.', whatHappened: 'The stock does jump, but the option barely moves — because implied volatility collapses the moment the earnings uncertainty resolves, and that Vega crush erases most of the gain the correct direction should have produced.', takeaway: 'Being right on direction is not the whole trade around a volatility event. When implied volatility is elevated going in, it usually falls hard afterward regardless of outcome — and that can offset gains from Delta alone.' },
];

const bodyZeroDte: LessonBlock[] = [
  { type: 'p', text: '0DTE means "zero days to expiration" — an option contract that expires the same day it is traded. SPX and SPY are where 0DTE trading really lives: SPX has listed expirations every single trading day (Monday through Friday) since 2022, and SPY effectively does too through its own daily-expiring series, so there is almost always a same-day expiration available on either one.' },
  { type: 'definitions', items: [
    { title: '0DTE contract', text: 'An option whose expiration date is today. Every hour that passes is a meaningfully larger share of its remaining lifespan than it would be on a weekly or monthly contract.' },
    { title: 'SPX 0DTE', text: 'Cash-settled and European-style (no early assignment) — you are settled in cash based on where SPX closes, and 10x the notional size of SPY per contract. Popular for size and for avoiding assignment risk entirely.' },
    { title: 'SPY 0DTE', text: 'American-style and physically settled — deep in-the-money SPY options can be assigned before expiration, and pin risk (the underlying settling right at your strike) is a real, practical concern into the close.' },
    { title: 'Gamma', text: "Already covered in the Greeks lesson, but it matters more here than anywhere else: Gamma is highest for at-the-money options with very little time left, which is the exact description of a 0DTE contract for most of its life." },
  ] },
  { type: 'h3', text: 'Why 0DTE can produce massive returns' },
  { type: 'list', items: [
    'Premium is cheap — you are buying almost pure Gamma and very little time value, so a small dollar risk can control a large amount of notional exposure',
    'Gamma acceleration means a contract can multiply several times over in value from a move that would barely register on a weekly option',
    'A fast, correctly-timed intraday move can turn a contract worth pennies into one worth dollars within minutes, not days',
  ] },
  { type: 'h3', text: 'Why 0DTE can produce massive losses' },
  { type: 'list', items: [
    'Theta decay is measured in minutes, not days — a contract can lose a large share of its value in an hour of sideways chop alone',
    'Gamma cuts both directions — the same acceleration that produces outsized gains produces outsized losses just as fast when the move goes against you',
    'Premium can go to essentially zero the same day it was bought, with no time left for the trade to "come back"',
    'Spreads are wide relative to the tiny premium involved, so slippage on entry and exit eats a much bigger percentage of a 0DTE trade than the same-dollar slippage would on a longer-dated one',
    'Pin risk and assignment risk (SPY especially) can leave a position settling in an unexpected, hard-to-predict way right at the close',
  ] },
  { type: 'h3', text: 'Why the contract can lose value even while price moves your way' },
  { type: 'p', text: "This is the part that confuses new 0DTE traders the most: you can be completely right about direction — the underlying rises exactly as you expected on a call — and still watch your contract lose money. It comes down to a race between two Greeks that are always running at the same time: Delta is adding value as the stock moves your way, while Theta is subtracting value every single minute just because time is passing. On a 0DTE contract, Theta is running at its absolute fastest, because there is almost no time left for it to burn through." },
  { type: 'h3', text: 'Worked example' },
  { type: 'p', text: "Say you buy a far OTM SPX 0DTE call with a Delta of 0.15 — meaning the option's price moves about $0.15 for every $1 move in SPX. In the last couple of hours before expiration, that same contract might be losing roughly $6 in value per hour purely to Theta, regardless of what price does. If SPX grinds up 10 points over that hour, Delta alone adds only about $1.50 of value (0.15 × 10) — nowhere close to covering the $6 Theta just took for that same hour. Net result: the contract is worth less than it was an hour ago, even though you correctly called the direction." },
  { type: 'p', text: "The fix is not to stop trading direction — it is to recognize that a 0DTE contract needs the move to be fast and large enough to let Delta (and the Gamma boost that comes as price approaches your strike) outrun Theta, not just eventually correct. A slow, grinding move in your favor can still lose money on a 0DTE; a fast, sharp move in your favor is where the outsized gains from earlier in this lesson actually come from." },
  { type: 'callout', label: 'Size it like it can hit zero — because it often does', text: "A 0DTE contract is one of the few instruments where losing the entire premium on a single trade is a routine outcome, not a tail-risk edge case. Risk only what you would be fully at peace losing on that one trade, and treat 0DTE as a small, deliberate slice of activity — not the core of a trading plan." },
  { type: 'h3', text: 'Timing — a commonly-cited heuristic, not a rule' },
  { type: 'p', text: 'The first 15–30 minutes after the open are frequently the noisiest, most algorithm-driven part of the session — wide spreads, fast whipsaws, and a directional read that can flip more than once. Many SPX/SPY 0DTE traders wait and watch that opening range play out before committing to a side, rather than trading the very first candles of the day.' },
  { type: 'callout', label: 'A commonly-referenced window', text: 'A rule of thumb some traders use: by roughly 9:30 AM Central Time (10:30 AM Eastern — about an hour after the opening bell), the market has often shown its hand for the session, with the early chop settled into a clearer intraday trend. This is a heuristic based on common trading behavior, not a guarantee — some sessions never settle into a clean trend at all. Confirm with your own read of price action and volume before treating "an hour in" as a green light by itself.' },
  { type: 'scenario', title: 'Same setup, two very different endings', setup: 'A trader buys a cheap, far OTM SPX 0DTE call right at the open, expecting a continuation of premarket strength, sized as if it were a normal weekly option.', whatHappened: "The first 20 minutes chop sideways and slightly down — normal opening noise — and Theta alone cuts the contract's value by more than half before 10:00 AM. By the time the market actually establishes its real direction closer to 10:30 AM Eastern, there is barely any premium left for a bounce to rescue.", takeaway: "The trade's direction was not necessarily wrong — the timing was. Entering into the noisiest, most Theta-expensive part of a 0DTE contract's single day of life is a different bet than entering once the session has shown some real direction. On a 0DTE contract, when you enter is as much a part of the trade as what you buy." },
];

const bodyPropFirms101: LessonBlock[] = [
  { type: 'p', text: "A futures prop (proprietary trading) firm lets you trade its capital instead of your own. Pass a rules-based evaluation on a simulated account, and the firm activates a funded account under its own risk parameters — you keep a share of the profits, and your own money was never actually at risk on the funded account itself." },
  { type: 'definitions', items: [
    { title: 'Evaluation / Combine', text: "A one- or two-phase test on a simulated account. Hit a stated profit target without breaching the drawdown or daily loss rules, and you pass." },
    { title: 'Simulated funded account', text: 'Most "funded" accounts run on simulated capital with real market data — not a live brokerage account in your name. Your trades do not touch a real exchange.' },
    { title: 'Live funded account', text: 'A smaller number of firms eventually move consistent traders to an account trading real capital on a real exchange. This is the exception, not the norm, industry-wide.' },
    { title: 'Scaling plan', text: 'A schedule that raises your buying power / account size after you hit consistent profit milestones on a funded account.' },
  ] },
  { type: 'h3', text: 'The business model, honestly' },
  { type: 'list', items: [
    'Evaluation fees are the primary, reliable revenue for most firms — commonly $50–$250 per attempt, with resets and activation fees adding up fast after a failed try',
    'Industry-wide pass rates run roughly 5–15% of evaluation attempts',
    'A much smaller share of traders who pass stay funded long enough to withdraw meaningfully — some firms report under 1% of all participants ever reach a live-capital stage',
    "That does not make prop firms a scam — it means the honest way to think about an evaluation fee is as tuition for a discipline test, not a lottery ticket",
  ] },
  { type: 'callout', label: 'Why this fits in Risk & Psychology', text: "Everything from Module 7 — position sizing, defining your stop first, patience — applies here with the volume turned up. A prop firm evaluation is, structurally, a real-time audit of exactly the habits that module covers." },
  { type: 'scenario', title: 'The serial reset', setup: 'A trader fails a $50K evaluation by blowing the drawdown two days after hitting 80% of the profit target, buys a reset, and starts over with the same aggressive sizing that caused the first failure.', whatHappened: 'The pattern repeats three more times over two months — each reset purchased with the conviction that "this time" will be different, without ever changing the position size that caused every prior failure.', takeaway: "A reset fixes the account, not the behavior. If a specific habit — oversizing after a win streak, moving a stop, revenge-trading a red day — caused the failure, that habit needs to change before the next attempt, not the account number." },
];

const bodyEvaluationAnatomy: LessonBlock[] = [
  { type: 'p', text: 'Every evaluation is built from the same handful of rules, just tuned differently by firm and account size. Understanding each one individually is what actually gets you funded — most failed evaluations come down to misreading one of these, usually the drawdown.' },
  { type: 'definitions', items: [
    { title: 'Profit target', text: 'The dollar amount of profit required to pass. Commonly scaled to roughly 6% of account size — $3,000 on a $50,000 account is the industry-standard benchmark.' },
    { title: 'Trailing drawdown', text: "The loss floor rises with every new equity high and never moves back down. A green week can still leave you one bad trade from a breach — this is the rule that ends the most funded accounts." },
    { title: 'End-of-day (EOD) / static drawdown', text: 'The loss floor only updates once, at the daily close — intraday swings do not move it. Meaningfully more forgiving than a trailing drawdown of the same dollar size.' },
    { title: 'Daily loss limit', text: 'A separate cap on how much you can lose in a single day before the account is deactivated for that day (not permanently). A growing number of firms have dropped this rule entirely in favor of the drawdown alone.' },
    { title: 'Consistency rule', text: 'Commonly requires your single best day of profit to stay under 50% of your total profit at the point you hit the target — designed to filter out one lucky day from genuine repeatable process.' },
    { title: 'Minimum trading days', text: 'The fewest number of separate days you must trade before the firm will certify a pass, even if you hit the profit target sooner.' },
  ] },
  { type: 'h3', text: 'Why the drawdown type matters more than the target' },
  { type: 'p', text: 'Two accounts with the exact same profit target and drawdown dollar amount can have completely different difficulty depending on whether that drawdown trails your equity or locks at the end of the day. A trailing drawdown punishes give-back on green days; an EOD drawdown does not care what happens between the open and the close, only where you land at settlement.' },
  { type: 'scenario', title: 'Passed intraday, failed by the close', setup: 'A trader on a trailing-drawdown evaluation is up $3,200 intraday — comfortably past the $3,000 target — with hours left in the session.', whatHappened: "Instead of flattening and locking in the pass, they keep trading 'to pad the cushion.' A late reversal gives back $1,400 before the close, and because the drawdown trails the new equity high made that day, the floor had already risen — the pullback breaches it and fails the evaluation on the same day the target was technically hit.", takeaway: "Hitting the target intraday is not the same as passing. On a trailing-drawdown account, the single highest-leverage decision of the day is often simply: stop trading once the target is hit." },
];

const bodyTopFirmsCompared: LessonBlock[] = [
  { type: 'p', text: "There are dozens of futures prop firms, but three consistently rank among the most established as of 2026: Topstep, Lucid Trading Co, and MyFundedFutures. Rules and pricing change often industry-wide — treat the numbers below as a snapshot for learning the shape of these programs, not a substitute for reading a firm's current rules page before paying for an evaluation." },
  { type: 'definitions', items: [
    { title: 'Topstep', text: "The longest-running name in the space (since 2012), CME futures only. Its $50K Trading Combine targets $3,000 profit against a $2,000 trailing Max Loss Limit that only moves at end-of-day but is monitored in real time. No default daily loss limit. A 50%-of-target consistency rule applies. Funded payouts run a 90/10 split." },
    { title: 'Lucid Trading Co', text: "Runs single-phase evaluations (as little as one trading day minimum) with profit targets scaled to about 6% of account size — roughly $3,000 on a $50K plan. Drawdown is end-of-day trailing, locking once at the daily close rather than moving with intraday highs, and there is no daily loss limit on any plan. A 50% consistency rule applies during the evaluation. Payouts are a 90/10 split." },
    { title: 'MyFundedFutures', text: "Also single-phase, $25K–$150K plans with roughly 6% profit targets ($3,000 on $50K). Drawdown style depends on the plan — some use intraday trailing, others end-of-day trailing with a fixed dollar floor. No plan carries a daily loss limit. Payout splits and frequency vary by plan, ranging from 80/20 up to 90/10, with some plans paying as often as every 48 hours." },
  ] },
  { type: 'h3', text: 'What actually differs between them' },
  { type: 'list', items: [
    '**Drawdown mechanics** — trailing vs. end-of-day, and whether it locks intraday or only at the close, is the single biggest factor in how forgiving an account feels',
    '**Daily loss limits** — most major firms have moved away from a hard daily limit in favor of the overall drawdown alone',
    '**Consistency rules** — a common 50%-of-target rule at multiple firms rewards a steady process over one outlier day',
    '**Payout split & frequency** — ranges roughly from 80/20 to 90/10 industry-wide, with payout cadence anywhere from every 48 hours to biweekly depending on the plan',
  ] },
  { type: 'note', text: "WickBetts is not affiliated with, sponsored by, or endorsed by Topstep, Lucid Trading Co, or MyFundedFutures. This lesson is educational only — always verify current rules, pricing, and payout policy directly on a firm's own website before purchasing an evaluation." },
];

const bodyFundedPayouts: LessonBlock[] = [
  { type: 'p', text: 'Passing an evaluation gets you a funded account — it does not automatically get you paid. Getting money out is its own set of rules, and missing one of them is a common way traders leave money on the table after doing the hard part.' },
  { type: 'definitions', items: [
    { title: 'Profit split', text: 'The percentage of withdrawn profit you keep. Industry-standard ranges run roughly 80/20 up to 90/10 in the trader\'s favor, and has trended toward 90/10 at several major firms through 2026.' },
    { title: 'First payout minimum', text: 'Many firms require a minimum number of trading days — or a minimum dollar amount in the account — before your very first withdrawal request is eligible, even if you are otherwise profitable sooner.' },
    { title: 'Payout frequency', text: 'How often you are allowed to request a withdrawal — commonly tied to a number of "winning days," a fixed cadence like biweekly, or, on some newer plans, as often as every 48 hours.' },
    { title: 'Payout consistency rules', text: "Some firms apply the same 50%-style consistency check to payout eligibility as they do to the evaluation — a single oversized day can delay or reduce what you're able to withdraw." },
  ] },
  { type: 'h3', text: 'The habit that actually determines your payout' },
  { type: 'p', text: 'None of this matters if the account does not survive between now and your first eligible withdrawal date. The single biggest threat to a first payout is not missing a rule about paperwork — it is breaching the drawdown after getting funded, often because the pressure feels different once real payout money is on the line.' },
  { type: 'scenario', title: 'Funded, then undone in a week', setup: 'A trader passes their evaluation and gets funded on a $50K account. In the excitement, they double their normal position size for the first week, reasoning the firm\'s capital is "not really their money" anyway.', whatHappened: "A string of three losing trades in one session — sized twice as large as the process that actually passed the evaluation — breaches the trailing drawdown four days after getting funded, before a single payout request was even eligible.", takeaway: "The exact process that passed the evaluation is the process that should run the funded account. Getting funded is not a signal to size up — the drawdown rules did not get more forgiving just because the account is now live." },
];

const bodyFundedRiskManagement: LessonBlock[] = [
  { type: 'p', text: 'On a funded account, risk management is not a best practice — it is the literal rulebook. One breach of a drawdown floor ends the account permanently, with no recovery and no second chance intraday. Every idea from Module 7 applies here, just with a hard, mechanical enforcement mechanism attached to it.' },
  { type: 'definitions', items: [
    { title: 'Drawdown cushion', text: 'The dollar distance between your current equity and the drawdown floor right now — not your total P&L. This is the number that actually matters minute to minute on a funded account.' },
    { title: 'Risk per trade, firm-account style', text: 'A common, conservative framework: risk no more than roughly 5–10% of your remaining drawdown cushion on any single trade. On a $2,000 max drawdown, that is a $100–$200 risk per trade — not $2,000.' },
    { title: 'A hard stop for the day', text: 'A personal daily loss limit you set yourself, tighter than the firm\'s (or as a substitute, on firms with none) — commonly 1–2 losing trades and you are done for the day, full stop.' },
    { title: 'Scaling down after a red day', text: 'Cut size, not just after a loss — after a losing streak. Trading the same size after two losses as you did before them is how a manageable drawdown becomes a breached one.' },
    { title: 'The "not my money" trap', text: "Treating a funded account's capital as less real than personal capital is one of the most common, well-documented reasons traders who passed a clean evaluation blow the funded account within the first few weeks." },
  ] },
  { type: 'h3', text: 'A practical framework for a $50K evaluation' },
  { type: 'list', items: [
    'Know your exact drawdown cushion before every session — not your profit, your distance to the floor',
    'Size every trade as a small, fixed fraction of that cushion, not a fixed number of contracts out of habit',
    'Set a personal stop-for-the-day at 1–2 losses, even on firms with no official daily loss limit',
    'After hitting the profit target, strongly consider stopping for the day rather than "padding the cushion" — see the trailing-drawdown scenario in the Evaluation Anatomy lesson',
    'Once funded, keep the exact size and process that passed the evaluation — do not scale up until a formal scaling plan says you have earned it',
  ] },
  { type: 'callout', label: 'The account is not yours until the payout clears', text: "Every dollar of unrealized 'profit' on a funded account is still exposed to a rule breach until it is actually withdrawn. Trade every session as if protecting the account matters more than growing it faster — because structurally, on a rules-based account, it does." },
  { type: 'scenario', title: 'The consistency-rule surprise', setup: 'A trader hits their full $3,000 profit target in a single explosive day on a strong trend, comfortably clearing the account minimums for trading days.', whatHappened: "The firm's consistency rule requires the single best day to stay under 50% of total profit at the time the target is reached — and that one huge day was effectively 100% of the profit. The pass is rejected until additional trading days bring that day's share back under the threshold.", takeaway: 'A profit target is not the only condition — read the consistency rule before the evaluation, not after a payout gets held up by it. A steady process across several days is often more valuable than one spectacular one.' },
];

const bodyTradingThroughHistory: LessonBlock[] = [
  { type: 'p', text: "Markets are older than most people assume — and the shape of today's trading desk was built one innovation at a time." },
  { type: 'timeline', items: [
    { year: '1602', text: 'The Dutch East India Company issues tradable shares on the **Amsterdam Stock Exchange** — widely considered the world\'s first modern stock exchange.' },
    { year: '1792', text: 'Twenty-four brokers sign the **Buttonwood Agreement** under a buttonwood tree on Wall Street, laying the groundwork for the New York Stock Exchange.' },
    { year: '1800s', text: 'The telegraph and ticker tape speed up how fast price information travels — the first real edge was often just getting the news first.' },
    { year: '1934', text: 'The **SEC** is created in the aftermath of the 1929 crash to regulate markets and protect investors.' },
    { year: '1971', text: "**Nasdaq** launches as the world's first electronic stock market." },
    { year: '1973', text: 'The Chicago Board Options Exchange (CBOE) opens, formalizing modern options trading.' },
    { year: '2009', text: "Bitcoin's genesis block is mined, kicking off the crypto markets from scratch." },
    { year: 'Today', text: 'Retail traders carry every market on this timeline in their pocket. The access changed completely — the need for discipline never did.' },
  ] },
];

const bodyTrailblazers: LessonBlock[] = [
  { type: 'p', text: 'Wall Street was not built to let everyone in. These traders and investors forced the door open anyway — and changed who gets to sit at the desk.' },
  { type: 'bios', items: [
    { name: 'Jeremiah G. Hamilton', meta: 'Broker · d. 1875', text: "Operating almost entirely outside the era's brokerage establishment, Hamilton built a fortune trading stocks, bonds, and shipping insurance in mid-19th-century New York — reportedly leaving an estate worth around $2 million at his death, making him widely regarded as America's first Black millionaire." },
    { name: 'Joseph L. Searles III', meta: 'NYSE floor broker · 1970', text: "In February 1970, Searles became the first African American member and floor broker of the New York Stock Exchange, breaking a barrier that had stood since the exchange's 1792 founding." },
    { name: 'Travers J. Bell Jr. & Willie L. Daniels', meta: 'Daniels & Bell · 1971', text: 'Co-founded Daniels & Bell, the first Black-owned investment firm to hold a seat on the New York Stock Exchange.' },
    { name: 'John W. Rogers Jr.', meta: 'Ariel Investments · 1983', text: 'At 24, Rogers started Ariel Investments with $200,000 raised from family and friends — the first Black-owned mutual fund company in the U.S. It has since grown into the largest minority-run asset manager in the country.' },
    { name: 'Mellody Hobson', meta: 'Co-CEO, Ariel Investments', text: "One of the most prominent Black women in American finance, Hobson has spent her career pushing financial literacy into the mainstream while helping lead Ariel Investments and chairing Starbucks' board." },
    { name: 'Chris Gardner', meta: 'Founder, Gardner Rich & Co.', text: 'After a period of homelessness, Gardner built a career as a stockbroker and went on to found his own brokerage firm — a story that later became widely known through _The Pursuit of Happyness_.' },
  ] },
  { type: 'note', text: 'This is a starting point, not a complete history — there are many more stories worth reading beyond this module.' },
];

export const LEARNING_MODULES: LearningModule[] = [
  { id: 'welcome', level: 'Beginner', kind: 'lesson', title: 'Welcome to WickBetts', tagline: 'What this academy is, and the one trait that matters more than any indicator.', minutes: 4, xp: 40, icon: 'school-outline', body: bodyWelcome, videos: [
    { title: 'Stock Market Explained in 4 Minutes | The Simplest Explanation', url: 'https://www.youtube.com/watch?v=effipLTUUl4', duration: '4:08' },
  ] },
  { id: 'markets-101', level: 'Beginner', kind: 'lesson', title: 'The Four Markets', tagline: 'Indices, futures, stocks, and crypto — what each one actually is.', minutes: 7, xp: 50, icon: 'layers-outline', body: bodyMarkets101, videos: [
    { title: 'Crypto Explained in Just 5 Minutes!', url: 'https://www.youtube.com/watch?v=hTYwTPmROrM', duration: '4:32' },
    { title: 'Futures Trading Explained For Beginners in 5 Minutes', url: 'https://www.youtube.com/watch?v=Dh5KFZqEHqU', duration: '5:59' },
  ] },
  { id: 'demo-to-live', level: 'Beginner', kind: 'lesson', title: 'From Demo to Live', tagline: "Where to practice, how much to risk first, and the checkpoint that tells you you're ready.", minutes: 5, xp: 40, icon: 'rocket-outline', body: bodyDemoToLive, videos: [
    { title: 'How to Paper Trade / Simulate Trades in TradingView (2026 Guide)', url: 'https://www.youtube.com/watch?v=1EnfqWoxuAY', duration: '3:35' },
  ] },
  { id: 'reading-the-chart', level: 'Intermediate', kind: 'lesson', title: 'Reading the Chart', tagline: 'Trend, volume, timeframes, support & resistance — before every trade.', minutes: 8, xp: 60, icon: 'trending-up-outline', body: bodyReadingTheChart, videos: [
    { title: 'Support/Resistance Explained in 60 Seconds', url: 'https://www.youtube.com/watch?v=YbWHkFX58L4', duration: '1:01' },
    { title: 'What is Support and Resistance in Trading?', url: 'https://www.youtube.com/watch?v=Wwxb3DROwrc', duration: '3:04' },
  ] },
  { id: 'candlestick-encyclopedia', level: 'Intermediate', kind: 'lesson', title: 'The Candlestick Encyclopedia', tagline: 'Every candle tells a story — learn to read all of them.', minutes: 12, xp: 80, icon: 'bar-chart-outline', body: bodyCandlestickEncyclopedia, videos: [
    { title: 'Candlestick Patterns Explained: Top 5 Patterns For Beginners', url: 'https://www.youtube.com/watch?v=qunnM_aQWQk', duration: '9:21' },
  ] },
  { id: 'candle-arcade', level: 'Intermediate', kind: 'game', title: 'Candle ID Arcade', tagline: 'Speed-round: name the pattern before the streak breaks.', minutes: 5, xp: 0, icon: 'game-controller-outline' },
  { id: 'indicators-toolkit', level: 'Advanced', kind: 'lesson', title: 'Indicators 101: SMA & Friends', tagline: 'The Simple Moving Average — the math, the meaning, and the crossover signals.', minutes: 9, xp: 70, icon: 'analytics-outline', body: bodyIndicatorsToolkit, videos: [
    { title: 'What Is The Simple Moving Average? (SMA) & How To Use It!', url: 'https://www.youtube.com/watch?v=TRy9InVeFc8', duration: '4:03' },
    { title: 'How to Use the Relative Strength Index (RSI)', url: 'https://www.youtube.com/watch?v=hbcCykbX14U', duration: '4:22' },
  ] },
  { id: 'risk-and-psychology', level: 'Advanced', kind: 'lesson', title: "Risk & the Trader's Mindset", tagline: 'Position sizing, stops, and the patience that keeps an edge alive.', minutes: 8, xp: 60, icon: 'shield-checkmark-outline', body: bodyRiskAndPsychology, videos: [
    { title: 'The Risk to Reward Ratio Explained in One Minute', url: 'https://www.youtube.com/watch?v=aKZsireNBIM', duration: '1:36' },
  ] },
  { id: 'liquidity-and-structure', level: 'Advanced', kind: 'lesson', title: 'Liquidity & Market Structure', tagline: 'Why price hunts obvious stops, and how to read structure like the desk does.', minutes: 7, xp: 60, icon: 'git-network-outline', body: bodyLiquidityAndStructure, videos: [
    { title: 'Liquidity Zones SIMPLIFIED', url: 'https://www.youtube.com/watch?v=0BOMeGq-J0I', duration: '8:38' },
    { title: 'High and Low Liquidity Zones in Trading Explained (Supply & Demand Basics)', url: 'https://www.youtube.com/watch?v=kAmPmTPJpg8', duration: '6:46' },
  ] },
  // ── Strategies curriculum ──────────────────────────────────────────────────
  // Five popular, named strategies — deliberately untagged (no specialization)
  // since each applies across stocks, futures, and crypto alike, unlike the
  // options- and funded-specific tracks below. Placed at Advanced, same tier
  // as Liquidity & Structure, since all five assume the reader already has
  // chart-reading and candlestick fundamentals from the Intermediate track.
  // No `videos` entries here — every other module's video links were
  // verified (existence + duration) before being added, and that
  // verification wasn't possible for these five in this pass. Omitting is
  // safer than shipping an unverified or dead YouTube link; add videos in a
  // follow-up once they've been checked the same way the rest were.
  { id: 'fair-value-gaps', level: 'Advanced', kind: 'lesson', title: 'Fair Value Gaps (FVG)', tagline: 'The three-candle imbalance price is statistically drawn back to fill.', minutes: 7, xp: 60, icon: 'scan-outline', body: bodyFairValueGaps },
  { id: 'scalping-strategies', level: 'Advanced', kind: 'lesson', title: 'Scalping Strategies', tagline: 'Small, fast, frequent — and why transaction costs are a real opponent.', minutes: 7, xp: 60, icon: 'flash-outline', body: bodyScalpingStrategies },
  { id: 'opening-range-breakout', level: 'Advanced', kind: 'lesson', title: 'Opening Range Breakout (ORB)', tagline: 'Trading the break of the first few minutes — and the false breakouts that come with it.', minutes: 7, xp: 60, icon: 'sunny-outline', body: bodyOpeningRangeBreakout },
  { id: 'support-resistance-trading', level: 'Advanced', kind: 'lesson', title: 'Trading Support & Resistance', tagline: 'Zones not lines, role reversal, and why heavily-tested levels get weaker.', minutes: 7, xp: 60, icon: 'swap-horizontal-outline', body: bodySupportResistanceTrading },
  { id: 'vwap-reversion', level: 'Advanced', kind: 'lesson', title: 'VWAP Reversion', tagline: "The institutional benchmark price reverts to — or trends away from, on the right kind of day.", minutes: 7, xp: 60, icon: 'pulse-outline', body: bodyVwapReversion },
  { id: 'options-basics', level: 'Advanced', kind: 'lesson', title: 'Options Basics: Calls, Puts & Strikes', tagline: 'Contracts, strikes, and why the strike matters as much as the direction.', minutes: 8, xp: 65, icon: 'options-outline', specialization: 'options', body: bodyOptionsBasics, videos: [
    { title: 'Options Trading for Beginners in 10 Minutes (2026)', url: 'https://www.youtube.com/watch?v=jVsnFHqAd0Y', duration: '9:47' },
  ] },
  { id: 'greeks-in-practice', level: 'Advanced', kind: 'lesson', title: 'The Greeks, In Practice', tagline: 'Delta, Theta, Gamma, and Vega — what each one actually costs you.', minutes: 9, xp: 70, icon: 'infinite-outline', specialization: 'options', body: bodyGreeksInPractice, videos: [
    { title: 'Option Greeks Explained (Delta, Gamma, Theta, Vega)', url: 'https://www.youtube.com/watch?v=99ru0mlYRO4', duration: '9:12' },
  ] },
  { id: 'prop-firms-101', level: 'Advanced', kind: 'lesson', title: "Prop Firms 101: Trading Someone Else's Capital", tagline: 'What a prop firm actually is, how the business works, and the honest odds.', minutes: 8, xp: 65, icon: 'briefcase-outline', specialization: 'funded', body: bodyPropFirms101 },
  { id: 'evaluation-anatomy', level: 'Advanced', kind: 'lesson', title: 'Anatomy of an Evaluation', tagline: 'Profit targets, trailing vs. EOD drawdowns, consistency rules — every piece explained.', minutes: 9, xp: 70, icon: 'analytics-outline', specialization: 'funded', body: bodyEvaluationAnatomy },
  { id: 'top-firms-compared', level: 'Advanced', kind: 'lesson', title: 'Top Firms Compared', tagline: 'Topstep, Lucid Trading Co, and MyFundedFutures — rules and payouts side by side.', minutes: 9, xp: 70, icon: 'git-compare-outline', specialization: 'funded', body: bodyTopFirmsCompared },
  { id: 'funded-payouts', level: 'Advanced', kind: 'lesson', title: 'Payouts & Getting Paid', tagline: 'Profit splits, payout minimums, and the habit that decides whether you ever see one.', minutes: 7, xp: 60, icon: 'cash-outline', specialization: 'funded', body: bodyFundedPayouts },
  { id: 'funded-risk-management', level: 'Expert', kind: 'lesson', title: 'Risk Management for Funded Traders', tagline: 'The rulebook has teeth now — a practical position-sizing framework for a live evaluation.', minutes: 10, xp: 80, icon: 'shield-checkmark-outline', specialization: 'funded', body: bodyFundedRiskManagement },
  { id: 'trading-through-history', level: 'Expert', kind: 'lesson', title: 'A Short History of Trading', tagline: 'From Amsterdam warehouses to algorithms — how markets got here.', minutes: 8, xp: 70, icon: 'hourglass-outline', body: bodyTradingThroughHistory, videos: [
    { title: 'The Hidden History Behind the New York Stock Exchange', url: 'https://www.youtube.com/shorts/2_KM19rvW94', duration: '1:35' },
  ] },
  { id: 'trailblazers', level: 'Expert', kind: 'lesson', title: 'Trailblazers: Great Black Traders & Investors', tagline: "The people who broke into rooms that weren't built for them.", minutes: 10, xp: 80, icon: 'ribbon-outline', body: bodyTrailblazers, videos: [
    { title: 'The Story Behind The Pursuit of Happyness: 20 Years Later with Chris Gardner', url: 'https://www.youtube.com/watch?v=oRvZjh8QK2g', duration: '7:00' },
  ] },
  { id: 'trivia-arena', level: 'Expert', kind: 'game', title: 'Trivia Arena', tagline: 'Mixed rapid-fire questions across every module.', minutes: 6, xp: 0, icon: 'help-circle-outline' },
  { id: 'trade-bias-simulator', level: 'Expert', kind: 'game', title: 'Trade Bias Simulator', tagline: 'Randomized ticker, a mock setup, one call: buy or sell.', minutes: 6, xp: 0, icon: 'shuffle-outline' },
  { id: 'zero-dte-options', level: 'Expert', kind: 'lesson', title: '0DTE Options: Same-Day Expiration', tagline: 'SPX and SPY 0DTE — why the returns and the losses can both be massive, and when to look.', minutes: 9, xp: 75, icon: 'alert-circle-outline', specialization: 'options', body: bodyZeroDte },
  { id: 'options-strike-lab', level: 'Expert', kind: 'game', title: 'Options Strike & Greeks Lab', tagline: 'Match the strike to the goal — Delta, Theta, and premium all in play.', minutes: 7, xp: 0, icon: 'infinite-outline', specialization: 'options' },
  { id: 'funded-combine-prep', level: 'Expert', kind: 'game', title: 'Funded Combine Prep', tagline: 'Optional: grow a paper account $3,000 without breaching a $2,000 trailing drawdown.', minutes: 10, xp: 0, icon: 'briefcase-outline', specialization: 'funded' },
  { id: 'pattern-recognition', level: 'Intermediate', kind: 'game', title: 'Pattern Recognition Trainer', tagline: 'Head & Shoulders, Double Top, Double Bottom — find the point that actually confirms each one.', minutes: 6, xp: 0, icon: 'trending-down-outline' },
  { id: 'portfolio-allocation-builder', level: 'Advanced', kind: 'game', title: 'Portfolio Allocation Builder', tagline: 'Split $10,000 across cash, options, and long-term holds — then see how each scenario plays out.', minutes: 8, xp: 0, icon: 'pie-chart-outline' },
  { id: 'risk-sizing-duel', level: 'Advanced', kind: 'game', title: 'Risk-Sizing Duel', tagline: 'Same positive edge, different risk per trade — find out why sizing decides who survives.', minutes: 7, xp: 0, icon: 'skull-outline' },
];

// ── XP / leveling ─────────────────────────────────────────────────────────────
export const XP_PER_LEVEL = 200;
export const TRACK_BONUS_XP = 100;

export function levelFromXp(xp: number): { level: number; intoLevel: number; forNext: number } {
  const level = 1 + Math.floor(xp / XP_PER_LEVEL);
  const intoLevel = xp % XP_PER_LEVEL;
  return { level, intoLevel, forNext: XP_PER_LEVEL };
}

export function shuffleArr<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function sampleArr<T>(arr: T[], n: number): T[] {
  return shuffleArr(arr).slice(0, Math.min(n, arr.length));
}
