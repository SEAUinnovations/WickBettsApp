import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/apiUrl';

export interface TickerEntry {
  shortName: string;
  price: number | null;
  changePercent: number | null;
}

/** Sector/group key (e.g. "indices", "technology") -> symbol -> ticker info. */
export type TickerSections = Record<string, Record<string, TickerEntry>>;

/**
 * Fetches the server's ticker directory: a JSON dictionary of the top
 * symbols in each sector with live price info, used to power the ticker
 * autocomplete/quick-pick UI. Polled on the same cadence as the market data
 * cache refreshes server-side.
 */
export function useTickerDirectory() {
  const [sections, setSections] = useState<TickerSections>({});
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/market/tickers`);
      if (!res.ok) return;
      const json = (await res.json()) as { sections: TickerSections };
      setSections(json.sections ?? {});
    } catch {
      // Silently degrade — the autocomplete just shows no suggestions.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), 15 * 60_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { sections, loading, refresh: fetch_ };
}
