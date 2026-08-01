import reducer, { getNotes, deleteNote } from './notesSlice';
import { logout } from './authSlice';

const pending = (thunk, requestId) => ({
  type: thunk.pending.type,
  meta: { requestId },
});
const fulfilled = (thunk, requestId, payload) => ({
  type: thunk.fulfilled.type,
  meta: { requestId },
  payload,
});
const rejected = (thunk, requestId, payload) => ({
  type: thunk.rejected.type,
  meta: { requestId, rejectedWithValue: true },
  payload,
});

const initialState = reducer(undefined, { type: '@@INIT' });

const notesPayload = (notes, total = notes.length) => ({
  notes,
  pagination: { page: 1, limit: 20, total, pages: 1 },
});

describe('notesSlice — getNotes stale-response race guard', () => {
  it('ignores a fulfilled response from a superseded request', () => {
    let state = reducer(initialState, pending(getNotes, 'A'));
    state = reducer(state, pending(getNotes, 'B'));

    const stale = reducer(
      state,
      fulfilled(getNotes, 'A', notesPayload([{ _id: 'stale' }], 99))
    );

    expect(stale.notes).toEqual([]);
    expect(stale.pagination.total).toBe(0);
    expect(stale.loading).toBe(true);
    expect(stale.notesLatestRequestId).toBe('B');
  });

  it('applies the fulfilled response from the latest request', () => {
    let state = reducer(initialState, pending(getNotes, 'A'));
    state = reducer(state, pending(getNotes, 'B'));
    state = reducer(state, fulfilled(getNotes, 'A', notesPayload([{ _id: 'stale' }], 99)));
    state = reducer(state, fulfilled(getNotes, 'B', notesPayload([{ _id: 'fresh' }], 1)));

    expect(state.notes).toEqual([{ _id: 'fresh' }]);
    expect(state.pagination.total).toBe(1);
    expect(state.loading).toBe(false);
  });

  it('ignores a rejected response from a superseded request', () => {
    let state = reducer(initialState, pending(getNotes, 'A'));
    state = reducer(state, pending(getNotes, 'B'));
    state = reducer(state, fulfilled(getNotes, 'B', notesPayload([{ _id: 'fresh' }])));

    const afterStaleError = reducer(state, rejected(getNotes, 'A', 'Failed to get notes'));

    expect(afterStaleError.error).toBeNull();
    expect(afterStaleError.notes).toEqual([{ _id: 'fresh' }]);
    expect(afterStaleError.loading).toBe(false);
  });

  it('records the error when the latest request rejects', () => {
    let state = reducer(initialState, pending(getNotes, 'A'));
    state = reducer(state, rejected(getNotes, 'A', 'boom'));

    expect(state.error).toBe('boom');
    expect(state.loading).toBe(false);
  });
});

describe('notesSlice — deleteNote', () => {
  it('removes the note and decrements pagination totals', () => {
    const state = {
      ...initialState,
      notes: [{ _id: 'a' }, { _id: 'b' }],
      pagination: { page: 1, limit: 1, total: 2, pages: 2 },
    };

    const next = reducer(state, fulfilled(deleteNote, 'A', { noteId: 'a' }));

    expect(next.notes).toEqual([{ _id: 'b' }]);
    expect(next.pagination.total).toBe(1);
    expect(next.pagination.pages).toBe(1);
  });
});

describe('notesSlice — logout', () => {
  it('resets to the initial state', () => {
    const state = {
      ...initialState,
      notes: [{ _id: 'a' }],
      filters: { type: 'interview', priority: 'high' },
      pagination: { page: 4, limit: 20, total: 80, pages: 4 },
      error: 'x',
      notesLatestRequestId: 'A',
    };

    expect(reducer(state, logout())).toEqual(initialState);
  });
});
