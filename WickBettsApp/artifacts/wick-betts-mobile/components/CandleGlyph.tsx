import React from 'react';
import Svg, { Line, Rect } from 'react-native-svg';
import type { CandleSpec } from '@/lib/learningData';

/**
 * Renders a small candlestick pattern glyph from geometry data (bodyTop/
 * bodyBottom/wickTop/wickBottom as 0-100 percentages of a 100-unit-tall
 * chart). Native port of the web app's inline SVG `CandleGlyph`.
 */
export function CandleGlyph({ candles, height = 92 }: { candles: CandleSpec[]; height?: number }) {
  const w = 26;
  const gap = 12;
  const totalW = candles.length * w + (candles.length - 1) * gap;
  return (
    <Svg viewBox={`0 0 ${totalW} 100`} width={totalW} height={height}>
      {candles.map((c, i) => {
        const cx = i * (w + gap) + w / 2;
        const color = c.bullish ? '#7AE2AA' : '#FB7185';
        const bodyH = Math.max(3, c.bodyBottom - c.bodyTop);
        return (
          <React.Fragment key={i}>
            <Line x1={cx} y1={c.wickTop} x2={cx} y2={c.wickBottom} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <Rect x={cx - w / 2} y={c.bodyTop} width={w} height={bodyH} fill={color} rx={2.5} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
