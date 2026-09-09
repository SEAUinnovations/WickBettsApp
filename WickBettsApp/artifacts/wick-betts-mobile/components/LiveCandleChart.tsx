import React, { useMemo } from 'react';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import type { SimCandle, SimSide } from '@/lib/liveSimEngine';

/**
 * Live-scrolling candlestick chart for the Live Trading Simulator. Same
 * react-native-svg primitives (Svg/Line/Rect/Text) that CandleGlyph and
 * PatternChart already use elsewhere in the Learning tab, extended with a
 * price axis, gridlines, a current-price marker, and an optional
 * open-position entry-price marker — no charting library, no gesture
 * handler, no pan/zoom: the window always auto-scrolls to the latest
 * candle, matching the simulator's own "AUTO" behavior.
 */
export function LiveCandleChart({
  candles,
  width,
  height = 260,
  entryPrice,
  entrySide,
}: {
  candles: SimCandle[];
  width: number;
  height?: number;
  entryPrice?: number | null;
  entrySide?: SimSide | null;
}) {
  const colors = useColors();
  const axisGutter = 56;
  const bottomGutter = 18;
  const topPad = 10;
  const plotW = Math.max(0, width - axisGutter);
  const plotH = Math.max(0, height - bottomGutter - topPad);

  const layout = useMemo(() => {
    if (candles.length === 0 || plotW <= 0 || plotH <= 0) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const c of candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    if (entryPrice != null) {
      min = Math.min(min, entryPrice);
      max = Math.max(max, entryPrice);
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const padding = (max - min) * 0.08;
    const rangeMin = min - padding;
    const rangeMax = max + padding;
    const range = rangeMax - rangeMin || 1;

    const slot = plotW / candles.length;
    const bodyW = Math.max(2, Math.min(10, slot * 0.62));

    const yFor = (price: number) => topPad + ((rangeMax - price) / range) * plotH;
    const xFor = (i: number) => i * slot + slot / 2;

    // ~4 evenly-spaced horizontal gridlines with price labels, like a
    // standard trading chart's right-hand price axis.
    const gridLines = 4;
    const priceTicks = Array.from({ length: gridLines + 1 }, (_, i) => rangeMin + (range * i) / gridLines);

    // A handful of evenly-spaced time labels along the bottom.
    const timeStops = [0, Math.floor(candles.length / 3), Math.floor((candles.length * 2) / 3), candles.length - 1].filter(
      (v, i, arr) => v >= 0 && arr.indexOf(v) === i,
    );

    return { rangeMin, rangeMax, range, slot, bodyW, yFor, xFor, priceTicks, timeStops };
  }, [candles, plotW, plotH, entryPrice]);

  if (!layout) return null;
  const { yFor, xFor, priceTicks, timeStops, bodyW } = layout;
  const last = candles[candles.length - 1];

  const formatPrice = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatClock = (ms: number) => {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  return (
    <Svg width={width} height={height}>
      {priceTicks.map((p, i) => {
        const y = yFor(p);
        return (
          <React.Fragment key={`grid-${i}`}>
            <Line x1={0} y1={y} x2={width - axisGutter} y2={y} stroke={colors.border} strokeWidth={1} opacity={0.6} />
            <SvgText x={width - axisGutter + 6} y={y + 3} fontSize={9} fill={colors.mutedForeground}>
              {formatPrice(p)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {timeStops.map((i) => (
        <SvgText key={`time-${i}`} x={xFor(i)} y={height - 4} fontSize={9} fill={colors.mutedForeground} textAnchor="middle">
          {formatClock(candles[i].time)}
        </SvgText>
      ))}

      {candles.map((c, i) => {
        const bull = c.close >= c.open;
        const color = bull ? '#7AE2AA' : '#FB7185';
        const cx = xFor(i);
        const bodyTop = yFor(Math.max(c.open, c.close));
        const bodyBottom = yFor(Math.min(c.open, c.close));
        const bodyH = Math.max(1.5, bodyBottom - bodyTop);
        return (
          <React.Fragment key={c.time}>
            <Line x1={cx} y1={yFor(c.high)} x2={cx} y2={yFor(c.low)} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
            <Rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={1} />
          </React.Fragment>
        );
      })}

      {entryPrice != null ? (
        <>
          <Line
            x1={0}
            y1={yFor(entryPrice)}
            x2={width - axisGutter}
            y2={yFor(entryPrice)}
            stroke={entrySide === 'short' ? '#FB7185' : '#7AE2AA'}
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.8}
          />
          <Rect
            x={4}
            y={yFor(entryPrice) - 8}
            width={38}
            height={16}
            rx={4}
            fill={entrySide === 'short' ? '#FB7185' : '#7AE2AA'}
            opacity={0.9}
          />
          <SvgText x={23} y={yFor(entryPrice) + 4} fontSize={8} fontWeight="bold" fill="#0B0714" textAnchor="middle">
            ENTRY
          </SvgText>
        </>
      ) : null}

      <Line
        x1={0}
        y1={yFor(last.close)}
        x2={width - axisGutter}
        y2={yFor(last.close)}
        stroke={colors.primary}
        strokeWidth={1}
        strokeDasharray="2 3"
        opacity={0.85}
      />
      <Rect x={width - axisGutter} y={yFor(last.close) - 9} width={axisGutter} height={18} rx={4} fill={colors.primary} />
      <SvgText x={width - axisGutter / 2} y={yFor(last.close) + 4} fontSize={9} fontWeight="bold" fill={colors.primaryForeground} textAnchor="middle">
        {formatPrice(last.close)}
      </SvgText>
    </Svg>
  );
}
