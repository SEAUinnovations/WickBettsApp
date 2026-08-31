import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

/**
 * Hand-drawn illustrative diagrams for lesson concepts that are much easier
 * to grasp as a picture than as a paragraph — a trend bouncing off support,
 * a moving-average crossover, market structure, a fair value gap, an
 * opening-range box, a VWAP reversion, an options payoff curve. Same
 * approach as CandleGlyph/PatternChart elsewhere in the Learning tab: fixed
 * hand-picked coordinates on a 0-100-ish grid, drawn with plain
 * react-native-svg primitives — no chart library, no live data, purely a
 * labeled illustration of the shape a member should learn to recognize.
 */
export type DiagramKind =
  | 'trend-and-sr'
  | 'sma-crossover'
  | 'market-structure'
  | 'fair-value-gap'
  | 'orb'
  | 'support-resistance-zone'
  | 'vwap-reversion'
  | 'options-payoff';

const GREEN = '#7AE2AA';
const RED = '#FB7185';
const BLUE = '#60A5FA';
const GOLD = '#E2C25A';
const ORANGE = '#FDBA74';
const MUTED = '#6B6478';
const GRID = '#2A2438';

function GridLabel({ x, y, children, color = MUTED, anchor = 'start' }: { x: number; y: number; children: string; color?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <SvgText x={x} y={y} fontSize={8} fontWeight="600" fill={color} textAnchor={anchor}>
      {children}
    </SvgText>
  );
}

export function LessonDiagram({ kind }: { kind: DiagramKind }) {
  switch (kind) {
    case 'trend-and-sr':
      return <TrendAndSR />;
    case 'sma-crossover':
      return <SmaCrossover />;
    case 'market-structure':
      return <MarketStructure />;
    case 'fair-value-gap':
      return <FairValueGap />;
    case 'orb':
      return <OpeningRangeBreakout />;
    case 'support-resistance-zone':
      return <SupportResistanceZone />;
    case 'vwap-reversion':
      return <VwapReversion />;
    case 'options-payoff':
      return <OptionsPayoff />;
    default:
      return null;
  }
}

// Price climbs off a support line, rejects off a resistance line, and pulls
// back — the two ideas "Reading the Chart" opens with, in one picture.
function TrendAndSR() {
  const w = 300;
  const h = 150;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Line x1={0} y1={112} x2={w} y2={112} stroke={GREEN} strokeDasharray="4,4" strokeWidth={1.2} opacity={0.6} />
      <GridLabel x={4} y={106} color={GREEN}>SUPPORT</GridLabel>
      <Line x1={0} y1={28} x2={w} y2={28} stroke={RED} strokeDasharray="4,4" strokeWidth={1.2} opacity={0.6} />
      <GridLabel x={4} y={22} color={RED}>RESISTANCE</GridLabel>
      <Polyline
        points="6,96 40,112 78,70 110,28 142,44 176,28 208,60 244,80 296,58"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={40} cy={112} r={4} fill={GREEN} />
      <Circle cx={110} cy={28} r={4} fill={RED} />
      <Circle cx={176} cy={28} r={4} fill={RED} />
    </Svg>
  );
}

// Two smoothed moving averages crossing — the short one flipping above the
// long one is a Golden Cross, the whole point of the "crossover signal" bullet.
function SmaCrossover() {
  const w = 300;
  const h = 150;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Polyline
        points="6,120 30,110 55,118 80,95 105,100 130,78 155,85 180,60 205,66 230,44 255,50 296,30"
        fill="none"
        stroke="#4A4258"
        strokeWidth={1.5}
        opacity={0.7}
      />
      <Path d="M6,108 C60,112 110,96 155,86 C210,74 260,50 296,34" fill="none" stroke={ORANGE} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M6,92 C70,88 120,86 168,80 C220,74 260,58 296,44" fill="none" stroke={BLUE} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={168} cy={80} r={5} fill={GOLD} />
      <GridLabel x={178} y={78} color={GOLD}>GOLDEN CROSS</GridLabel>
      <GridLabel x={6} y={16} color={ORANGE}>50-SMA</GridLabel>
      <GridLabel x={60} y={16} color={BLUE}>200-SMA</GridLabel>
      <GridLabel x={220} y={16} color="#8A8299">PRICE</GridLabel>
    </Svg>
  );
}

// Higher-high / higher-low uptrend structure, then a Change of Character —
// price breaks the last higher-low, the early warning sign that lesson calls out.
function MarketStructure() {
  const w = 300;
  const h = 150;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Line x1={0} y1={96} x2={200} y2={96} stroke={GRID} strokeDasharray="3,4" strokeWidth={1} />
      <Polyline
        points="6,120 46,70 86,96 126,44 166,74 206,20 246,96 296,130"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={46} cy={70} r={4} fill={GREEN} /><GridLabel x={46} y={62} anchor="middle" color={GREEN}>HH</GridLabel>
      <Circle cx={86} cy={96} r={4} fill={GREEN} /><GridLabel x={86} y={110} anchor="middle" color={GREEN}>HL</GridLabel>
      <Circle cx={126} cy={44} r={4} fill={GREEN} /><GridLabel x={126} y={36} anchor="middle" color={GREEN}>HH</GridLabel>
      <Circle cx={166} cy={74} r={4} fill={GREEN} /><GridLabel x={166} y={88} anchor="middle" color={GREEN}>HL</GridLabel>
      <Circle cx={206} cy={20} r={4} fill={GREEN} /><GridLabel x={206} y={14} anchor="middle" color={GREEN}>HH</GridLabel>
      <Circle cx={246} cy={96} r={4.5} fill={RED} /><GridLabel x={246} y={112} anchor="middle" color={RED}>CHoCH</GridLabel>
      <GridLabel x={4} y={140} color="#8A8299">Uptrend structure (HH / HL) → break below the last HL</GridLabel>
    </Svg>
  );
}

// Three candles: a small first candle, a big momentum candle, and a third
// candle whose wick never overlaps the first — the shaded box is the gap.
function FairValueGap() {
  const w = 220;
  const h = 150;
  const candleW = 30;
  const gap = 26;
  const x1 = 30, x2 = x1 + candleW + gap, x3 = x2 + candleW + gap;
  // y geometry (0 = top): candle 1 sits low-ish, candle 2 rips up (big green
  // body), candle 3 continues up. FVG = zone between candle1's wick-top (86)
  // and candle3's wick-bottom (54) — never overlapping.
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Rect x={x1 + candleW / 2 - candleW * 0.9} y={54} width={candleW * 1.8 + gap} height={86 - 54} fill={GREEN} opacity={0.16} />
      <SvgText x={x1 + candleW + gap / 2} y={46} fontSize={8} fontWeight="700" fill={GREEN} textAnchor="middle">GAP (IMBALANCE)</SvgText>
      {/* candle 1 */}
      <Line x1={x1 + candleW / 2} y1={78} x2={x1 + candleW / 2} y2={112} stroke={GREEN} strokeWidth={1.6} />
      <Rect x={x1} y={86} width={candleW} height={18} fill={GREEN} rx={2} />
      {/* candle 2 — big momentum candle */}
      <Line x1={x2 + candleW / 2} y1={18} x2={x2 + candleW / 2} y2={102} stroke={GREEN} strokeWidth={1.6} />
      <Rect x={x2} y={26} width={candleW} height={68} fill={GREEN} rx={2} />
      {/* candle 3 */}
      <Line x1={x3 + candleW / 2} y1={10} x2={x3 + candleW / 2} y2={60} stroke={GREEN} strokeWidth={1.6} />
      <Rect x={x3} y={18} width={candleW} height={22} fill={GREEN} rx={2} />
      <GridLabel x={x1 + candleW / 2} y={130} anchor="middle" color="#8A8299">1</GridLabel>
      <GridLabel x={x2 + candleW / 2} y={130} anchor="middle" color="#8A8299">2</GridLabel>
      <GridLabel x={x3 + candleW / 2} y={130} anchor="middle" color="#8A8299">3</GridLabel>
    </Svg>
  );
}

// A shaded box for the first-15-minutes range, then a breakout candle
// closing above the range high.
function OpeningRangeBreakout() {
  const w = 300;
  const h = 150;
  const rangeTop = 56, rangeBottom = 92, rangeRight = 150;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Rect x={10} y={rangeTop} width={rangeRight - 10} height={rangeBottom - rangeTop} fill={BLUE} opacity={0.14} />
      <Line x1={10} y1={rangeTop} x2={rangeRight} y2={rangeTop} stroke={BLUE} strokeWidth={1.4} />
      <Line x1={10} y1={rangeBottom} x2={rangeRight} y2={rangeBottom} stroke={BLUE} strokeWidth={1.4} />
      <GridLabel x={14} y={rangeTop - 5} color={BLUE}>OPENING RANGE (first 15 min)</GridLabel>
      <Polyline
        points={`14,80 30,72 46,86 62,74 78,88 94,70 110,82 126,66 ${rangeRight},${rangeTop - 2} 190,44 220,26 296,14`}
        fill="none"
        stroke={GREEN}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={rangeRight} y1={rangeTop} x2={rangeRight} y2={140} stroke={GRID} strokeDasharray="3,4" strokeWidth={1} />
      <Circle cx={rangeRight + 6} cy={rangeTop - 4} r={4.5} fill={GREEN} />
      <GridLabel x={rangeRight + 14} y={rangeTop - 1} color={GREEN}>BREAKOUT</GridLabel>
    </Svg>
  );
}

// A resistance zone (band, not a line) tested three times and rejected in
// red, then broken and retested from above as support in green — the role
// reversal this lesson's whole scenario is built around.
function SupportResistanceZone() {
  const w = 300;
  const h = 150;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Rect x={0} y={54} width={w} height={14} fill={ORANGE} opacity={0.18} />
      <GridLabel x={4} y={48} color={ORANGE}>ZONE, NOT A LINE</GridLabel>
      <Polyline
        points="6,120 34,72 62,60 90,72 118,58 146,72 174,60 202,44 230,58 258,44 296,30"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={34} cy={72} r={4} fill={RED} />
      <Circle cx={90} cy={72} r={4} fill={RED} />
      <Circle cx={146} cy={72} r={4} fill={RED} />
      <Circle cx={202} cy={44} r={4.5} fill={GREEN} />
      <GridLabel x={202} y={36} anchor="middle" color={GREEN}>BREAK</GridLabel>
      <Circle cx={230} cy={58} r={4.5} fill={GREEN} />
      <GridLabel x={230} y={72} anchor="middle" color={GREEN}>RETEST → HOLDS</GridLabel>
    </Svg>
  );
}

// A steadily rising VWAP line with price stretching well above it, then
// reverting back down to touch it.
function VwapReversion() {
  const w = 300;
  const h = 150;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <Path d="M6,120 C80,108 160,92 296,66" fill="none" stroke={ORANGE} strokeWidth={2.2} strokeLinecap="round" />
      <GridLabel x={10} y={132} color={ORANGE}>VWAP</GridLabel>
      <Polyline
        points="6,116 30,100 54,104 78,74 102,50 126,30 150,40 174,64 198,86 222,78 246,70 296,64"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={126} y1={30} x2={126} y2={70} stroke={MUTED} strokeDasharray="3,4" strokeWidth={1} />
      <GridLabel x={130} y={26} color="#8A8299">STRETCHED</GridLabel>
      <Circle cx={222} cy={78} r={4.5} fill={GREEN} />
      <GridLabel x={222} y={94} anchor="middle" color={GREEN}>REVERTS TO VWAP</GridLabel>
    </Svg>
  );
}

// Two hockey-stick payoff curves side by side — a long call (profits above
// the strike) and a long put (profits below it) — with the premium paid
// shown as the flat loss zone on the wrong side of the strike.
function OptionsPayoff() {
  const w = 300;
  const h = 150;
  const midY = 70;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      {/* Call, left half */}
      <Line x1={10} y1={midY} x2={130} y2={midY} stroke={GRID} strokeWidth={1} />
      <Line x1={70} y1={16} x2={70} y2={130} stroke={MUTED} strokeDasharray="3,4" strokeWidth={1} />
      <GridLabel x={70} y={142} anchor="middle" color="#8A8299">STRIKE</GridLabel>
      <Path d="M14,82 L70,82 L126,20" fill="none" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <GridLabel x={14} y={12} color={GREEN}>LONG CALL</GridLabel>
      <GridLabel x={14} y={94} color={RED}>PREMIUM AT RISK</GridLabel>

      {/* Divider */}
      <Line x1={150} y1={10} x2={150} y2={140} stroke={GRID} strokeWidth={1} />

      {/* Put, right half */}
      <Line x1={166} y1={midY} x2={290} y2={midY} stroke={GRID} strokeWidth={1} />
      <Line x1={226} y1={16} x2={226} y2={130} stroke={MUTED} strokeDasharray="3,4" strokeWidth={1} />
      <GridLabel x={226} y={142} anchor="middle" color="#8A8299">STRIKE</GridLabel>
      <Path d="M170,20 L226,82 L286,82" fill="none" stroke={RED} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <GridLabel x={230} y={12} color={RED}>LONG PUT</GridLabel>
      <GridLabel x={170} y={94} color={RED}>PREMIUM AT RISK</GridLabel>
    </Svg>
  );
}
