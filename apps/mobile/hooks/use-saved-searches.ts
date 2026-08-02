import { useCallback, useState } from 'react';
import api from '@/lib/api';

export type SavedSearch = {
  _id: string;
  name: string;
  criteria: Record<string, unknown>;
  alertsEnabled?: boolean;
  lastSeenAt?: string | null;
  newCount?: number;
};

/**
 * Saved searches for the current user. `enabled` should be false for guests —
 * the list is cleared rather than fetched so a previous account's searches
 * never linger after logout.
 */
export function useSavedSearches(enabled: boolean) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [emailAlertsAvailable, setEmailAlertsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSearches([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/api/searches');
      setSearches(res.data.searches || []);
      setEmailAlertsAvailable(Boolean(res.data.emailAlertsAvailable));
    } catch {
      // Saved searches are supplementary — a failure here shouldn't block the
      // search screen. The next focus/refresh retries.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const createSearch = useCallback(
    async (name: string, criteria: Record<string, string>) => {
      await api.post('/api/searches', { name, criteria });
      await refresh();
    },
    [refresh]
  );

  const removeSearch = useCallback(async (id: string) => {
    await api.delete(`/api/searches/${id}`);
    setSearches((prev) => prev.filter((s) => s._id !== id));
  }, []);

  const toggleAlerts = useCallback(async (id: string, alertsEnabled: boolean) => {
    // Optimistic — the switch flips immediately and rolls back on failure.
    setSearches((prev) =>
      prev.map((s) => (s._id === id ? { ...s, alertsEnabled } : s))
    );
    try {
      await api.patch(`/api/searches/${id}/alerts`, { enabled: alertsEnabled });
    } catch (err) {
      setSearches((prev) =>
        prev.map((s) => (s._id === id ? { ...s, alertsEnabled: !alertsEnabled } : s))
      );
      throw err;
    }
  }, []);

  const markSeen = useCallback(async (id: string) => {
    setSearches((prev) => prev.map((s) => (s._id === id ? { ...s, newCount: 0 } : s)));
    try {
      await api.post(`/api/searches/${id}/seen`);
    } catch {
      // The count is derived server-side, so it simply reappears next refresh.
    }
  }, []);

  const totalNewCount = searches.reduce((sum, s) => sum + (s.newCount || 0), 0);

  return {
    searches,
    emailAlertsAvailable,
    loading,
    totalNewCount,
    refresh,
    createSearch,
    removeSearch,
    toggleAlerts,
    markSeen,
  };
}
