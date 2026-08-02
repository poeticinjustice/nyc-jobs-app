import reducer, {
  getSavedSearches,
  toggleSearchAlerts,
  markSearchSeen,
} from './searchesSlice';
import { logout } from './authSlice';

const fulfilled = (thunk, payload) => ({
  type: thunk.fulfilled.type,
  meta: { requestId: 'A' },
  payload,
});

const initialState = reducer(undefined, { type: '@@INIT' });

describe('searchesSlice — getSavedSearches', () => {
  it('stores the searches and the emailAlertsAvailable flag', () => {
    const next = reducer(
      initialState,
      fulfilled(getSavedSearches, {
        searches: [{ _id: 's1', name: 'Analyst' }],
        emailAlertsAvailable: true,
      })
    );

    expect(next.savedSearches).toEqual([{ _id: 's1', name: 'Analyst' }]);
    expect(next.emailAlertsAvailable).toBe(true);
    expect(next.loading).toBe(false);
  });

  it('coerces a missing emailAlertsAvailable to false', () => {
    const next = reducer(
      initialState,
      fulfilled(getSavedSearches, { searches: [] })
    );

    expect(next.emailAlertsAvailable).toBe(false);
  });
});

describe('searchesSlice — toggleSearchAlerts', () => {
  it('preserves the derived newCount that the response does not carry', () => {
    const state = {
      ...initialState,
      savedSearches: [
        { _id: 's1', name: 'Analyst', emailAlerts: false, newCount: 7 },
        { _id: 's2', name: 'Engineer', emailAlerts: false, newCount: 2 },
      ],
    };

    const next = reducer(
      state,
      fulfilled(toggleSearchAlerts, {
        search: { _id: 's1', name: 'Analyst', emailAlerts: true },
        emailAlertsAvailable: true,
      })
    );

    expect(next.savedSearches[0]).toEqual({
      _id: 's1',
      name: 'Analyst',
      emailAlerts: true,
      newCount: 7,
    });
    // Other searches are untouched
    expect(next.savedSearches[1]).toEqual({
      _id: 's2',
      name: 'Engineer',
      emailAlerts: false,
      newCount: 2,
    });
    expect(next.emailAlertsAvailable).toBe(true);
  });

  it('is a no-op when the search is not in the list', () => {
    const state = {
      ...initialState,
      savedSearches: [{ _id: 's1', newCount: 3 }],
    };

    const next = reducer(
      state,
      fulfilled(toggleSearchAlerts, {
        search: { _id: 'missing', emailAlerts: true },
        emailAlertsAvailable: false,
      })
    );

    expect(next.savedSearches).toEqual([{ _id: 's1', newCount: 3 }]);
  });
});

describe('searchesSlice — markSearchSeen', () => {
  it('zeroes the newCount for the matching search', () => {
    const state = {
      ...initialState,
      savedSearches: [
        { _id: 's1', name: 'Analyst', newCount: 7 },
        { _id: 's2', name: 'Engineer', newCount: 2 },
      ],
    };

    const next = reducer(
      state,
      fulfilled(markSearchSeen, {
        search: { _id: 's1', name: 'Analyst', lastSeenAt: '2026-01-01T00:00:00.000Z' },
      })
    );

    expect(next.savedSearches[0]).toEqual({
      _id: 's1',
      name: 'Analyst',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      newCount: 0,
    });
    expect(next.savedSearches[1].newCount).toBe(2);
  });
});

describe('searchesSlice — logout', () => {
  it('resets to the initial state', () => {
    const state = {
      ...initialState,
      savedSearches: [{ _id: 's1' }],
      matchesBySearch: { s1: [{ jobId: '1' }] },
      emailAlertsAvailable: true,
      error: 'x',
    };

    expect(reducer(state, logout())).toEqual(initialState);
  });
});
