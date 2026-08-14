import { useCallback, useEffect, useState } from 'react';

import { API_BASE } from '@/lib/apiUrl';
import { useAuth } from '@/context/AuthContext';

export interface NewsArticle {
  id: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  category: string;
  summary: string;
}

export function useNewsFeed() {
  const { getToken } = useAuth();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(15 * 60_000);

  // News is a paid room — the feed endpoint requires an active subscription
  // (or admin) — so this needs an Authorization header just like signals.
  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/news/feed`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (body.code === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setArticles([]);
          return;
        }
        throw new Error('Access denied');
      }
      setSubscriptionRequired(false);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        articles: NewsArticle[];
        cachedAt: number;
        refreshIntervalMs?: number;
      };
      setArticles(json.articles);
      setLastFetch(json.cachedAt);
      setRefreshIntervalMs(json.refreshIntervalMs ?? 15 * 60_000);
    } catch (e) {
      setError('News feed unavailable');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetch_, refreshIntervalMs]);

  return { articles, loading, error, subscriptionRequired, lastFetch, refreshIntervalMs, refresh: fetch_ };
}
