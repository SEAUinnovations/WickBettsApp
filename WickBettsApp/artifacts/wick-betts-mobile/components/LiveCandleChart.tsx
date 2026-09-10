import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import type { SimCandle, SimSide } from '@/lib/liveSimEngine';

/**
 * Live-scrolling candlestick chart for the Live Trading Simulator, styled to
 * read like a real charting terminal — a recessed dark plot panel distinct
 * from the surrounding card, a faint ticker watermark, vertical + horizontal
 * gridlines, a right-hand price scale and bottom time scale, and a
 * TradingView-style OHLC readout for the forming candle. Still built from
 * the same plain react-native-svg primitives (Svg/Line/Rect/Text) the rest
 * of the Learning tab's charts use: no charting library, no gesture handler,
 * no pan/zoom/crosshair — the window always auto-scrolls to the latest
 * candle, matching the simulator's own "AUTO" behavior. `width`/`height` are
 * fully caller-controlled, so the screen can expand this into a much larger
 * panel on demand.
 */
export function LiveCandleChart({
  candles,
  width,
  height = 260,
  entryPrice,
  entrySide,
  symbol,
}: {
  candles: SimCandle[];
  width: number;
  height?: number;
  entryPrice?: number | null;
  entrySide?: SimSide | null;
  /** Shown as a large, faint watermark behind the candles and in the OHLC readout — purely decorative, the same convention a real charting terminal uses. */
  symbol?: string;
}) {
  const colors = useColors();
  const axisGutter = 58;
  const bottomGutter = 20;
  const topPad = 12;
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
    const bodyW = Math.max(2, Math.min(12, slot * 0.62));

    const yFor = (price: number) => topPad + ((rangeMax - price) / range) * plotH;
    const xFor = (i: number) => i * slot + slot / 2;

    // ~5 evenly-spaced horizontal gridlines with price labels, like a
    // standard trading chart's right-hand price axis.
    const gridLines = 5;
    const priceTicks = Array.from({ length: gridLines + 1 }, (_, i) => rangeMin + (range * i) / gridLines);

    // A handful of evenly-spaced time labels — and matching vertical
    // gridlines, the way a real chart's time scale ticks — along the bottom.
    const timeStops = [
      0,
      Math.floor(candles.length / 4),
      Math.floor(candles.length / 2),
      Math.floor((candles.length * 3) / 4),
      candles.length - 1,
    ].filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i);

    return { rangeMin, rangeMax, range, slot, bodyW, yFor, xFor, priceTicks, timeStops };
  }, [candles, plotW, plotH, entryPrice]);

  if (!layout) return null;
  const { yFor, xFor, priceTicks, timeStops, bodyW } = layout;
  const last = candles[candles.length - 1];
  const lastBull = last.close >= last.open;
  const lastColor = lastBull ? '#7AE2AA' : '#FB7185';

  const formatPrice = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatClock = (ms: number) => {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  return (
    <View style={{ width, height, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background }}>
      {/* Top-left OHLC readout for the forming candle — the same legend a
          real charting terminal shows for whatever bar is under the cursor;
          here it always tracks the live edge since there's no crosshair. */}
      <View style={{ position: 'absolute', top: 8, left: 10, zIndex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
        {symbol ? (
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.mutedForeground, marginRight: 2 }}>{symbol}</Text>
        ) : null}
        {([
          ['O', last.open],
          ['H', last.high],
          ['L', last.low],
          ['C', last.close],
        ] as const).map(([label, value]) => (
          <Text key={label} style={{ fontSize: 10, fontWeight: '600', color: label === 'C' ? lastColor : colors.mutedForeground }}>
            {label} <Text style={{ color: label === 'C' ? lastColor : colors.foreground }}>{formatPrice(value)}</Text>
          </Text>
        ))}
      </View>

      <Svg width={width} height={height}>
        {/* Faint ticker watermark behind everything — purely decorative. */}
        {symbol ? (
          <SvgText
            x={plotW / 2}
            y={topPad + plotH / 2 + plotH * 0.09}
            fontSize={Math.min(plotW, plotH) * 0.42}
            fontWeight="bold"
            fill={colors.border}
            opacity={0.4}
            textAnchor="middle"
          >
            {symbol}
          </SvgText>
        ) : null}

        {/* Vertical gridlines at the time-axis ticks. */}
        {timeStops.map((i) => (
          <Line
            key={`vgrid-${i}`}
            x1={xFor(i)}
            y1={topPad}
            x2={xFor(i)}
            y2={topPad + plotH}
            stroke={colors.border}
            strokeWidth={1}
            opacity={0.35}
          />
        ))}

        {/* Horizontal gridlines + right-hand price scale. */}
        {priceTicks.map((p, i) => {
          const y = yFor(p);
          return (
            <React.Fragment key={`grid-${i}`}>
              <Line x1={0} y1={y} x2={plotW} y2={y} stroke={colors.border} strokeWidth={1} opacity={0.35} />
              <SvgText x={plotW + 8} y={y + 3} fontSize={9} fill={colors.mutedForeground}>
                {formatPrice(p)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Price-scale gutter divider. */}
        <Line x1={plotW} y1={0} x2={plotW} y2={height - bottomGutter} stroke={colors.border} strokeWidth={1} opacity={0.7} />
        {/* Time-scale gutter divider. */}
        <Line x1={0} y1={height - bottomGutter} x2={plotW} y2={height - bottomGutter} stroke={colors.border} strokeWidth={1} opacity={0.7} />

        {timeStops.map((i) => (
          <SvgText key={`time-${i}`} x={xFor(i)} y={height - 5} fontSize={9} fill={colors.mutedForeground} textAnchor="middle">
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
              x2={plotW}
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
          x2={plotW}
          y2={yFor(last.close)}
          stroke={colors.primary}
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.85}
        />
        <Rect x={plotW} y={yFor(last.close) - 9} width={axisGutter} height={18} rx={4} fill={colors.primary} />
        <SvgText x={plotW + axisGutter / 2} y={yFor(last.close) + 4} fontSize={9} fontWeight="bold" fill={colors.primaryForeground} textAnchor="middle">
          {formatPrice(last.close)}
        </SvgText>
      </Svg>
    </View>
  );
}
