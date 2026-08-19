import { useCallback, useEffect, useState } from 'react';

import { API_BASE } from '@/lib/apiUrl';
import { useAuth } from '@/context/AuthContext';

export interface QuoteItem {
  symbol: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
  // The API (routes/market.ts) always includes this on every quote — it was
  // missing here, which is what broke the tabs heatmap's volume detail row.
  volume: number;
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
  const { getToken } = useAuth();
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(15 * 60_000);

  // The live-priced board is a paid room — /market/quotes requires an
  // active subscription (or admin), so this needs an Authorization header.
  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/market/quotes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (body.code === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setData(null);
          return;
        }
        throw new Error('Access denied');
      }
      setSubscriptionRequired(false);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MarketData;
      setData(json);
      setRefreshIntervalMs(json.refreshIntervalMs ?? 15 * 60_000);
    } catch (e) {
      setError('Market data unavailable');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetch_, refreshIntervalMs]);

  return { data, loading, error, subscriptionRequired, refresh: fetch_ };
}
