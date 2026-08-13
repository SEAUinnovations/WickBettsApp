import { useCallback, useEffect, useState } from 'react';

import { API_BASE } from '@/lib/apiUrl';

export interface QuoteItem {
  symbol: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
  group: string;
  currency: string;
}

interface MarketData {
  quotes: QuoteItem[];
  fetchedAt: number;
  stale?: boolean;
  refreshIntervalMs?: number;
}

export function useMarketData() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(15 * 60_000);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/market/quotes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MarketData;
      setData(json);
      setRefreshIntervalMs(json.refreshIntervalMs ?? 15 * 60_000);
    } catch (e) {
      setError('Market data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetch_, refreshIntervalMs]);

  return { data, loading, error, refresh: fetch_ };
}
