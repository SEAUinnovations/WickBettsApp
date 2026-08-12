import { useCallback, useEffect, useState } from 'react';

import { API_BASE } from '@/lib/apiUrl';

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
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(15 * 60_000);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/news/feed`);
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
  }, []);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetch_, refreshIntervalMs]);

  return { articles, loading, error, lastFetch, refreshIntervalMs, refresh: fetch_ };
}
