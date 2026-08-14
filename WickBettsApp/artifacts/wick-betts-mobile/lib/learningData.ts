import type { Ionicons } from '@expo/vector-icons';

/**
 * Content + data model for the Learning tab (the academy). Ported from the
 * (now-retired) wick-betts web app's Learning feature — same copy, same
 * candlestick geometry, same trivia bank, same duration-verified YouTube
 * suggestions — restructured as plain data so it can render natively with
 * react-native-svg + Text/View instead of raw JSX/HTML.
 */

export type LearningLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export const LEARNING_LEVELS: LearningLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

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
  | { type: 'timeline'; items: { year: string; text: string }[] }
  | { type: 'bios'; items: { name: string; meta: string; text: string }[] }
  | { type: 'note'; text: string };

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
];

const bodyReadingTheChart: LessonBlock[] = [
  { type: 'p', text: 'Understanding the chart is the first thing to do before placing any trade — before an indicator, before a candlestick pattern, before anything else.' },
  { type: 'definitions', items: [
    { title: 'Trend', text: 'Is price bullish (climbing) or bearish (falling)? Everything else you do should agree with the answer, not fight it.' },
    { title: 'Volume', text: 'Is there a lot of it? If so, figure out when, where, and why — volume is the market telling you how much conviction is behind a move.' },
    { title: 'Timeframe', text: 'Start from the Daily (D) chart to find the higher-timeframe trend first, then drop into lower timeframes to time an entry.' },
    { title: 'Support & Resistance', text: 'Support is a price floor where buying has stepped in before; resistance is a price ceiling where selling has capped price before. Price tends to react at both.' },
  ] },
  { type: 'h3', text: 'Liquidity zones — a preview' },
  { type: 'p', text: 'A liquidity zone is an area packed with resting stop-losses and pending orders. Price is frequently drawn toward these zones before reversing — the _Liquidity & Market Structure_ module in the Advanced track goes much deeper on this.' },
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
  { type: 'h3', text: 'The rest of the toolkit' },
  { type: 'definitions', items: [
    { title: 'EMA', text: 'An Exponential Moving Average weights recent prices more heavily than an SMA, so it reacts faster to new moves.' },
    { title: 'RSI', text: 'Relative Strength Index — a 0–100 momentum gauge. Above 70 is generally considered overbought, below 30 oversold.' },
    { title: 'MACD', text: 'Moving Average Convergence Divergence — tracks the relationship between two EMAs to gauge trend and momentum together.' },
    { title: 'Volume', text: 'Confirms conviction. A move on rising volume carries more weight than the same move on a quiet tape.' },
  ] },
  { type: 'note', text: 'Indicators lag price — they describe what already happened. They work best stacked on top of the chart-reading and candlestick skills from earlier modules, not used alone.' },
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
  { type: 'h3', text: 'Why "obvious" levels get run first' },
  { type: 'p', text: 'The support and resistance everyone can see are exactly where the stop orders pile up. A quick move through that level to grab liquidity — a stop hunt — before reversing is one of the most common reasons a level almost holds and then does not.' },
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
  { id: 'trading-through-history', level: 'Expert', kind: 'lesson', title: 'A Short History of Trading', tagline: 'From Amsterdam warehouses to algorithms — how markets got here.', minutes: 8, xp: 70, icon: 'hourglass-outline', body: bodyTradingThroughHistory, videos: [
    { title: 'The Hidden History Behind the New York Stock Exchange', url: 'https://www.youtube.com/shorts/2_KM19rvW94', duration: '1:35' },
  ] },
  { id: 'trailblazers', level: 'Expert', kind: 'lesson', title: 'Trailblazers: Great Black Traders & Investors', tagline: "The people who broke into rooms that weren't built for them.", minutes: 10, xp: 80, icon: 'ribbon-outline', body: bodyTrailblazers, videos: [
    { title: 'The Story Behind The Pursuit of Happyness: 20 Years Later with Chris Gardner', url: 'https://www.youtube.com/watch?v=oRvZjh8QK2g', duration: '7:00' },
  ] },
  { id: 'trivia-arena', level: 'Expert', kind: 'game', title: 'Trivia Arena', tagline: 'Mixed rapid-fire questions across every module.', minutes: 6, xp: 0, icon: 'help-circle-outline' },
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
