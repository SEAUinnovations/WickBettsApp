import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/apiUrl';
import { useAuth } from '@/context/AuthContext';

export interface MentorshipDaySlots {
  day: string;
  date: string;
  dateLabel: string;
  slots: string[];
}

export interface MentorshipBooking {
  id: string;
  userId: string;
  day: string;
  sessionDate: string;
  slot: string;
  status: 'confirmed' | 'cancelled';
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Loads the bookable mentorship calendar and the member's confirmed
 * bookings, and persists new bookings to the server. Every request is gated
 * server-side (403 MENTORSHIP_REQUIRED) — this hook surfaces that state so
 * the screen can render the correct locked/unlocked UI instead of trusting
 * client-only checks.
 */
export function useMentorship(enabled: boolean) {
  const { getToken } = useAuth();
  const [days, setDays] = useState<MentorshipDaySlots[]>([]);
  const [bookings, setBookings] = useState<MentorshipBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateBlocked, setGateBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setGateBlocked(false);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const headers = { Authorization: `Bearer ${token}` };
      const [slotsRes, bookingsRes] = await Promise.all([
        fetch(`${API_BASE}/mentorship/slots`, { headers }),
        fetch(`${API_BASE}/mentorship/bookings`, { headers }),
      ]);
      if (slotsRes.status === 403 || bookingsRes.status === 403) {
        setGateBlocked(true);
        setDays([]);
        setBookings([]);
        return;
      }
      if (!slotsRes.ok) throw new Error(`HTTP ${slotsRes.status}`);
      if (!bookingsRes.ok) throw new Error(`HTTP ${bookingsRes.status}`);
      const slotsJson = (await slotsRes.json()) as { days: MentorshipDaySlots[] };
      const bookingsJson = (await bookingsRes.json()) as { bookings: MentorshipBooking[] };
      setDays(slotsJson.days);
      setBookings(bookingsJson.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the mentorship calendar');
    } finally {
      setLoading(false);
    }
  }, [enabled, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmBooking = useCallback(
    async (payload: { day: string; date: string; slot: string }) => {
      setBooking(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${API_BASE}/mentorship/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (res.status === 403) {
          setGateBlocked(true);
          throw new Error('An active Mentorship subscription is required to book a session.');
        }
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? 'Could not book this session. Please try again.');
        }
        const json = (await res.json()) as { booking: MentorshipBooking };
        setBookings((current) => [json.booking, ...current.filter((b) => b.id !== json.booking.id)]);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not book this session.');
        return false;
      } finally {
        setBooking(false);
      }
    },
    [getToken],
  );

  return { days, bookings, loading, booking, error, gateBlocked, refresh: load, confirmBooking };
}
