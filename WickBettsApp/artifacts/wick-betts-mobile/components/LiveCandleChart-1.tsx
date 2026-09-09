import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
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
export interface CandleIndicatorSeries {
  /** Simple or exponential moving average, one value per candle (null = not enough history yet). Rendered as one line — pass whichever of sma/ema is active. */
  sma?: (number | null)[];
  ema?: (number | null)[];
  vwap?: (number | null)[];
}

const RSI_PANEL_HEIGHT = 52;
const RSI_PANEL_GAP = 10;

export function LiveCandleChart({
  candles,
  width,
  height = 260,
  entryPrice,
  entrySide,
  takeProfitPrice,
  stopLossPrice,
  indicators,
  rsi,
}: {
  candles: SimCandle[];
  width: number;
  height?: number;
  entryPrice?: number | null;
  entrySide?: SimSide | null;
  /** Optional TP/SL trigger prices for the open position — drawn as labeled dashed lines, same idea as the entry-price marker. */
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  /** Optional overlay series drawn directly on the price panel (moving average, VWAP). */
  indicators?: CandleIndicatorSeries;
  /** Optional RSI series (0-100), one value per candle — rendered as its own sub-panel below the price chart when present. */
  rsi?: (number | null)[];
}) {
  const colors = useColors();
  const axisGutter = 56;
  const bottomGutter = 18;
  const topPad = 10;
  const showRsi = !!rsi && rsi.some((v) => v != null);
  const plotW = Math.max(0, width - axisGutter);
  const plotH = Math.max(0, height - bottomGutter - topPad);
  const totalHeight = height + (showRsi ? RSI_PANEL_GAP + RSI_PANEL_HEIGHT : 0);

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
    if (takeProfitPrice != null) {
      min = Math.min(min, takeProfitPrice);
      max = Math.max(max, takeProfitPrice);
    }
    if (stopLossPrice != null) {
      min = Math.min(min, stopLossPrice);
      max = Math.max(max, stopLossPrice);
    }
    for (const series of [indicators?.sma, indicators?.ema, indicators?.vwap]) {
      if (!series) continue;
      for (const v of series) {
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
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
  }, [candles, plotW, plotH, entryPrice, takeProfitPrice, stopLossPrice, indicators]);

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

  // Builds an SVG polyline point-string for an indicator series, skipping
  // the leading run of nulls (not enough history yet) — the series is
  // otherwise contiguous, so no mid-line gaps to worry about.
  const overlayPoints = (series: (number | null)[] | undefined) => {
    if (!series) return null;
    const pts: string[] = [];
    for (let i = 0; i < series.length && i < candles.length; i++) {
      const v = series[i];
      if (v == null) continue;
      pts.push(`${xFor(i)},${yFor(v)}`);
    }
    return pts.length >= 2 ? pts.join(' ') : null;
  };

  const smaPoints = overlayPoints(indicators?.sma);
  const emaPoints = overlayPoints(indicators?.ema);
  const vwapPoints = overlayPoints(indicators?.vwap);

  const rsiY = (v: number) => RSI_PANEL_HEIGHT - (Math.max(0, Math.min(100, v)) / 100) * RSI_PANEL_HEIGHT;
  const rsiPoints = (() => {
    if (!rsi) return null;
    const pts: string[] = [];
    for (let i = 0; i < rsi.length && i < candles.length; i++) {
      const v = rsi[i];
      if (v == null) continue;
      pts.push(`${xFor(i)},${rsiY(v)}`);
    }
    return pts.length >= 2 ? pts.join(' ') : null;
  })();

  const bracketLine = (price: number, label: string, color: string) => (
    <React.Fragment key={label}>
      <Line
        x1={0}
        y1={yFor(price)}
        x2={width - axisGutter}
        y2={yFor(price)}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.8}
      />
      <Rect x={4} y={yFor(price) - 8} width={26} height={16} rx={4} fill={color} opacity={0.9} />
      <SvgText x={17} y={yFor(price) + 4} fontSize={8} fontWeight="bold" fill="#0B0714" textAnchor="middle">
        {label}
      </SvgText>
    </React.Fragment>
  );

  return (
    <View style={{ height: totalHeight }}>
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

      {vwapPoints ? <Polyline points={vwapPoints} fill="none" stroke="#E2C25A" strokeWidth={1.6} opacity={0.85} /> : null}
      {smaPoints ? <Polyline points={smaPoints} fill="none" stroke="#60A5FA" strokeWidth={1.6} opacity={0.9} /> : null}
      {emaPoints ? <Polyline points={emaPoints} fill="none" stroke="#FDBA74" strokeWidth={1.6} opacity={0.9} /> : null}

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

      {takeProfitPrice != null ? bracketLine(takeProfitPrice, 'TP', '#7AE2AA') : null}
      {stopLossPrice != null ? bracketLine(stopLossPrice, 'SL', '#FB7185') : null}

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

    {showRsi ? (
      <Svg width={width} height={RSI_PANEL_HEIGHT} style={{ marginTop: RSI_PANEL_GAP }}>
        {[30, 50, 70].map((level) => {
          const y = rsiY(level);
          return (
            <React.Fragment key={`rsi-grid-${level}`}>
              <Line
                x1={0}
                y1={y}
                x2={width - axisGutter}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
                opacity={level === 50 ? 0.35 : 0.55}
                strokeDasharray={level === 50 ? undefined : '3 3'}
              />
              <SvgText x={width - axisGutter + 6} y={y + 3} fontSize={8} fill={colors.mutedForeground}>
                {level}
              </SvgText>
            </React.Fragment>
          );
        })}
        {rsiPoints ? <Polyline points={rsiPoints} fill="none" stroke="#C084FC" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /> : null}
        <SvgText x={4} y={10} fontSize={8} fontWeight="700" fill={colors.mutedForeground}>
          RSI (14)
        </SvgText>
      </Svg>
    ) : null}
    </View>
  );
}
