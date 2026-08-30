import React from 'react';
import Svg, { Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import type { CandleSpec } from '@/lib/learningData';

export interface ChartMarker {
  index: number;
  label: string;
  state: 'default' | 'correct' | 'incorrect';
}

/**
 * Renders a multi-candle price path (Head & Shoulders / Double Top / Double
 * Bottom snapshots for the Pattern Recognition Trainer) plus optional
 * labeled swing-point markers, using the same react-native-svg primitives
 * (Svg/Line/Rect) that CandleGlyph already uses elsewhere in the Learning
 * tab — no new gesture or drawing library involved, and no touch handling
 * lives on the SVG itself: markers are purely visual labels, the actual
 * A/B/C tap targets are ordinary Pressable buttons rendered below the chart.
 */
export function PatternChart({ candles, markers = [], height = 170 }: { candles: CandleSpec[]; markers?: ChartMarker[]; height?: number }) {
  const w = 14;
  const gap = 6;
  const totalW = candles.length * w + (candles.length - 1) * gap;

  const markerColor = (state: ChartMarker['state']) => (state === 'correct' ? '#7AE2AA' : state === 'incorrect' ? '#FB7185' : '#60A5FA');

  return (
    <Svg viewBox={`0 0 ${totalW} 100`} width={totalW} height={height}>
      {candles.map((c, i) => {
        const cx = i * (w + gap) + w / 2;
        const color = c.bullish ? '#7AE2AA' : '#FB7185';
        const bodyH = Math.max(2.5, c.bodyBottom - c.bodyTop);
        return (
          <React.Fragment key={i}>
            <Line x1={cx} y1={c.wickTop} x2={cx} y2={c.wickBottom} stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
            <Rect x={cx - w / 2} y={c.bodyTop} width={w} height={bodyH} fill={color} rx={1.5} opacity={0.85} />
          </React.Fragment>
        );
      })}
      {markers.map((m) => {
        const c = candles[m.index];
        if (!c) return null;
        const cx = m.index * (w + gap) + w / 2;
        const center = (c.wickTop + c.wickBottom) / 2;
        const isUpperHalf = center < 50;
        const cy = isUpperHalf ? Math.max(7, c.wickTop - 8) : Math.min(93, c.wickBottom + 8);
        const color = markerColor(m.state);
        return (
          <React.Fragment key={`marker-${m.index}`}>
            <Circle cx={cx} cy={cy} r={6.5} fill="none" stroke={color} strokeWidth={2} />
            <SvgText x={cx} y={cy + 2.8} fontSize={7.5} fontWeight="bold" fill={color} textAnchor="middle">
              {m.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
