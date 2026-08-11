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

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/news/feed`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { articles: NewsArticle[]; cachedAt: number };
      setArticles(json.articles);
      setLastFetch(json.cachedAt);
    } catch (e) {
      setError('News feed unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), 5 * 60_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { articles, loading, error, lastFetch, refresh: fetch_ };
}
