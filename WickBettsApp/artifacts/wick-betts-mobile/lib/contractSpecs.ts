/**
 * Real, exchange-defined contract/lot specs used by the "Contracts, Lot
 * Sizes & Leverage" lesson and by the Live Trading Simulator's instrument
 * picker. These multipliers, tick sizes, and lot units are the actual CME
 * (futures) and standard retail-forex conventions — not simulated — even
 * though the simulator's own price series is still a random walk, never a
 * live quote. Kept dependency-free (no React) so both the lesson content and
 * the simulator engine can import it without a cycle.
 */

export interface FuturesContractSpec {
  symbol: string;
  name: string;
  /** Dollars of P&L per 1.00 index point of movement, for one contract. */
  pointValue: number;
  /** The smallest price increment the exchange allows, in index points. */
  tickSize: number;
  /** Dollar value of one tick (tickSize * pointValue) — kept explicit rather than derived so lesson copy can quote it directly. */
  tickValue: number;
}

// CME E-mini Nasdaq-100 — the "full-size" contract.
export const NQ_SPEC: FuturesContractSpec = {
  symbol: 'NQ',
  name: 'E-mini Nasdaq-100',
  pointValue: 20,
  tickSize: 0.25,
  tickValue: 5,
};

// CME Micro E-mini Nasdaq-100 — same index, same tick size, exactly 1/10th
// the dollar multiplier of NQ.
export const MNQ_SPEC: FuturesContractSpec = {
  symbol: 'MNQ',
  name: 'Micro E-mini Nasdaq-100',
  pointValue: 2,
  tickSize: 0.25,
  tickValue: 0.5,
};

export interface ForexLotSpec {
  id: 'standard' | 'mini' | 'micro' | 'nano';
  label: string;
  /** Units of base currency this lot represents. */
  units: number;
  /** Approximate USD value of one pip on a USD-quoted major pair (e.g. EUR/USD) at this lot size. */
  pipValue: number;
}

// Standard retail-forex lot sizes, largest to smallest. Pip values are the
// familiar textbook approximations for a USD-quoted major pair — real pip
// value drifts slightly with the exact pair and rate, but these are the
// numbers every forex broker quotes when explaining lot sizing.
export const FOREX_LOTS: ForexLotSpec[] = [
  { id: 'standard', label: 'Standard Lot', units: 100_000, pipValue: 10 },
  { id: 'mini', label: 'Mini Lot', units: 10_000, pipValue: 1 },
  { id: 'micro', label: 'Micro Lot', units: 1_000, pipValue: 0.1 },
  { id: 'nano', label: 'Nano Lot', units: 100, pipValue: 0.01 },
];
