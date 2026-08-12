import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/apiUrl';
import { useAuth } from '@/context/AuthContext';

export interface WatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  note: string | null;
  targetPrice: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function useWatchlist() {
  const { getToken, isSignedIn, user } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!isSignedIn) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setItems([]);
        return;
      }
      const res = await fetch(`${API_BASE}/watchlist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: WatchlistItem[] };
      setItems(json.items);
    } catch {
      setError('Watchlist unavailable');
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems, user?.id]);

  const addItem = useCallback(async (payload: { symbol: string; note?: string; targetPrice?: string }) => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/watchlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to add watchlist item');
      }
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add watchlist item');
    } finally {
      setSaving(false);
    }
  }, [fetchItems, getToken]);

  const removeItem = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/watchlist/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to remove watchlist item');
      }
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove watchlist item');
    } finally {
      setSaving(false);
    }
  }, [getToken]);

  return { items, loading, saving, error, refresh: fetchItems, addItem, removeItem };
}