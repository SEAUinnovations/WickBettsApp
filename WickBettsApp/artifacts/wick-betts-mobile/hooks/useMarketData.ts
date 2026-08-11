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
}

export function useMarketData() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/market/quotes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MarketData;
      setData(json);
    } catch (e) {
      setError('Market data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), 60_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}
