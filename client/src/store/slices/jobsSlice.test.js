import reducer, {
  searchJobs,
  getJobDetails,
  getSavedJobs,
  unsaveJob,
  bulkUpdateJobStatus,
  markJobsSeen,
} from './jobsSlice';
import { logout } from './authSlice';

// Hand-built actions — no store, no network, no thunk dispatch.
const pending = (thunk, requestId, arg) => ({
  type: thunk.pending.type,
  meta: { requestId, arg },
  payload: undefined,
});
const fulfilled = (thunk, requestId, payload, arg) => ({
  type: thunk.fulfilled.type,
  meta: { requestId, arg },
  payload,
});
const rejected = (thunk, requestId, payload, arg) => ({
  type: thunk.rejected.type,
  meta: { requestId, arg, rejectedWithValue: true },
  payload,
});

const initialState = reducer(undefined, { type: '@@INIT' });

const searchPayload = (jobs, total = jobs.length, newSinceLastSeen = 0) => ({
  jobs,
  pagination: { page: 1, limit: 20, total, pages: 1 },
  newSinceLastSeen,
});

describe('jobsSlice — stale-response race guards', () => {
  describe('searchJobs', () => {
    it('ignores a fulfilled response from a superseded request', () => {
      let state = reducer(initialState, pending(searchJobs, 'A'));
      state = reducer(state, pending(searchJobs, 'B'));

      const stale = reducer(
        state,
        fulfilled(searchJobs, 'A', searchPayload([{ jobId: 'stale-1' }], 99, 7))
      );

      expect(stale.searchResults).toEqual([]);
      expect(stale.searchPagination.total).toBe(0);
      expect(stale.newSinceLastSeen).toBe(0);
      // Still waiting on request B
      expect(stale.searchLoading).toBe(true);
      expect(stale.searchLatestRequestId).toBe('B');
    });

    it('applies the fulfilled response from the latest request', () => {
      let state = reducer(initialState, pending(searchJobs, 'A'));
      state = reducer(state, pending(searchJobs, 'B'));
      state = reducer(
        state,
        fulfilled(searchJobs, 'A', searchPayload([{ jobId: 'stale-1' }], 99, 7))
      );

      const fresh = reducer(
        state,
        fulfilled(searchJobs, 'B', searchPayload([{ jobId: 'fresh-1' }], 1, 3))
      );

      expect(fresh.searchResults).toEqual([{ jobId: 'fresh-1' }]);
      expect(fresh.searchPagination.total).toBe(1);
      expect(fresh.newSinceLastSeen).toBe(3);
      expect(fresh.searchLoading).toBe(false);
    });

    it('ignores a rejected response from a superseded request', () => {
      let state = reducer(initialState, pending(searchJobs, 'A'));
      state = reducer(state, pending(searchJobs, 'B'));
      state = reducer(
        state,
        fulfilled(searchJobs, 'B', searchPayload([{ jobId: 'fresh-1' }]))
      );

      const afterStaleError = reducer(
        state,
        rejected(searchJobs, 'A', 'Failed to search jobs')
      );

      expect(afterStaleError.searchError).toBeNull();
      expect(afterStaleError.searchResults).toEqual([{ jobId: 'fresh-1' }]);
      expect(afterStaleError.searchLoading).toBe(false);
    });

    it('records the error when the latest request rejects', () => {
      let state = reducer(initialState, pending(searchJobs, 'A'));
      state = reducer(state, rejected(searchJobs, 'A', 'boom'));

      expect(state.searchError).toBe('boom');
      expect(state.searchLoading).toBe(false);
    });
  });

  describe('getJobDetails', () => {
    it('ignores a fulfilled response from a superseded request', () => {
      let state = reducer(initialState, pending(getJobDetails, 'A'));
      state = reducer(state, pending(getJobDetails, 'B'));

      const stale = reducer(
        state,
        fulfilled(getJobDetails, 'A', { jobId: 'stale-job' })
      );

      expect(stale.currentJob).toBeNull();
      expect(stale.detailsLoading).toBe(true);
    });

    it('applies the fulfilled response from the latest request', () => {
      let state = reducer(initialState, pending(getJobDetails, 'A'));
      state = reducer(state, pending(getJobDetails, 'B'));
      state = reducer(state, fulfilled(getJobDetails, 'A', { jobId: 'stale-job' }));
      state = reducer(state, fulfilled(getJobDetails, 'B', { jobId: 'fresh-job' }));

      expect(state.currentJob).toEqual({ jobId: 'fresh-job' });
      expect(state.detailsLoading).toBe(false);
    });

    it('ignores a rejected response from a superseded request', () => {
      let state = reducer(initialState, pending(getJobDetails, 'A'));
      state = reducer(state, pending(getJobDetails, 'B'));
      state = reducer(state, fulfilled(getJobDetails, 'B', { jobId: 'fresh-job' }));

      const afterStaleError = reducer(
        state,
        rejected(getJobDetails, 'A', 'Failed to get job details')
      );

      expect(afterStaleError.detailsError).toBeNull();
      expect(afterStaleError.currentJob).toEqual({ jobId: 'fresh-job' });
      expect(afterStaleError.detailsLoading).toBe(false);
    });
  });

  describe('getSavedJobs', () => {
    it('ignores a fulfilled response from a superseded request', () => {
      let state = reducer(initialState, pending(getSavedJobs, 'A'));
      state = reducer(state, pending(getSavedJobs, 'B'));

      const stale = reducer(
        state,
        fulfilled(getSavedJobs, 'A', {
          jobs: [{ jobId: 'stale-1' }],
          pagination: { page: 1, limit: 20, total: 42, pages: 3 },
        })
      );

      expect(stale.savedJobs).toEqual([]);
      expect(stale.savedPagination.total).toBe(0);
      expect(stale.savedJobsLoading).toBe(true);
    });

    it('applies the fulfilled response from the latest request', () => {
      let state = reducer(initialState, pending(getSavedJobs, 'A'));
      state = reducer(state, pending(getSavedJobs, 'B'));
      state = reducer(
        state,
        fulfilled(getSavedJobs, 'A', {
          jobs: [{ jobId: 'stale-1' }],
          pagination: { page: 1, limit: 20, total: 42, pages: 3 },
        })
      );
      state = reducer(
        state,
        fulfilled(getSavedJobs, 'B', {
          jobs: [{ jobId: 'fresh-1' }],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        })
      );

      expect(state.savedJobs).toEqual([{ jobId: 'fresh-1' }]);
      expect(state.savedPagination.total).toBe(1);
      expect(state.savedJobsLoading).toBe(false);
    });

    it('ignores a rejected response from a superseded request', () => {
      let state = reducer(initialState, pending(getSavedJobs, 'A'));
      state = reducer(state, pending(getSavedJobs, 'B'));
      state = reducer(
        state,
        fulfilled(getSavedJobs, 'B', {
          jobs: [{ jobId: 'fresh-1' }],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        })
      );

      const afterStaleError = reducer(
        state,
        rejected(getSavedJobs, 'A', 'Failed to get saved jobs')
      );

      expect(afterStaleError.savedJobsError).toBeNull();
      expect(afterStaleError.savedJobs).toEqual([{ jobId: 'fresh-1' }]);
      expect(afterStaleError.savedJobsLoading).toBe(false);
    });
  });
});

describe('jobsSlice — markJobsSeen', () => {
  it('clears the new-since-last-seen count and unflags every search result', () => {
    const state = {
      ...initialState,
      newSinceLastSeen: 12,
      searchResults: [
        { jobId: '1', isNew: true },
        { jobId: '2', isNew: false },
        { jobId: '3', isNew: true },
      ],
    };

    const next = reducer(state, fulfilled(markJobsSeen, 'A', { newSinceLastSeen: 0 }));

    expect(next.newSinceLastSeen).toBe(0);
    expect(next.searchResults.map((j) => j.isNew)).toEqual([false, false, false]);
    // other job fields are preserved
    expect(next.searchResults.map((j) => j.jobId)).toEqual(['1', '2', '3']);
  });
});

describe('jobsSlice — bulkUpdateJobStatus', () => {
  it('updates only the matching {source, jobId} pairs', () => {
    const state = {
      ...initialState,
      savedJobs: [
        { jobId: '1', source: 'nyc', applicationStatus: 'interested' },
        { jobId: '1', source: 'nys', applicationStatus: 'interested' },
        { jobId: '2', source: 'nyc', applicationStatus: 'interested' },
      ],
    };

    const next = reducer(
      state,
      fulfilled(bulkUpdateJobStatus, 'A', {
        jobs: [{ jobId: '1', source: 'nyc' }],
        status: 'applied',
      })
    );

    expect(next.savedJobs).toEqual([
      { jobId: '1', source: 'nyc', applicationStatus: 'applied' },
      { jobId: '1', source: 'nys', applicationStatus: 'interested' },
      { jobId: '2', source: 'nyc', applicationStatus: 'interested' },
    ]);
  });

  it('treats a missing source as "nyc" on both sides of the match', () => {
    const state = {
      ...initialState,
      savedJobs: [
        { jobId: '1', applicationStatus: 'interested' },
        { jobId: '2', source: 'federal', applicationStatus: 'interested' },
      ],
    };

    const next = reducer(
      state,
      fulfilled(bulkUpdateJobStatus, 'A', {
        jobs: [{ jobId: '1' }],
        status: 'rejected',
      })
    );

    expect(next.savedJobs[0].applicationStatus).toBe('rejected');
    expect(next.savedJobs[1].applicationStatus).toBe('interested');
  });
});

describe('jobsSlice — unsaveJob', () => {
  it('removes the job and decrements the saved pagination totals', () => {
    const state = {
      ...initialState,
      savedJobs: [
        { jobId: '1', source: 'nyc' },
        { jobId: '2', source: 'nyc' },
      ],
      savedPagination: { page: 1, limit: 1, total: 2, pages: 2 },
    };

    const next = reducer(
      state,
      fulfilled(unsaveJob, 'A', { jobId: '1', source: 'nyc', message: 'ok' })
    );

    expect(next.savedJobs).toEqual([{ jobId: '2', source: 'nyc' }]);
    expect(next.savedPagination.total).toBe(1);
    expect(next.savedPagination.pages).toBe(1);
    expect(next.saveLoading).toBe(false);
  });

  it('does not remove a same-id job from a different source', () => {
    const state = {
      ...initialState,
      savedJobs: [
        { jobId: '1', source: 'nyc' },
        { jobId: '1', source: 'nys' },
      ],
      savedPagination: { page: 1, limit: 20, total: 2, pages: 1 },
    };

    const next = reducer(
      state,
      fulfilled(unsaveJob, 'A', { jobId: '1', source: 'nys' })
    );

    expect(next.savedJobs).toEqual([{ jobId: '1', source: 'nyc' }]);
  });

  it('never drives the pagination total below zero', () => {
    const state = {
      ...initialState,
      savedJobs: [],
      savedPagination: { page: 1, limit: 20, total: 0, pages: 0 },
    };

    const next = reducer(
      state,
      fulfilled(unsaveJob, 'A', { jobId: '1', source: 'nyc' })
    );

    expect(next.savedPagination.total).toBe(0);
  });

  it('flips isSaved off on the matching search result and current job', () => {
    const state = {
      ...initialState,
      currentJob: { jobId: '1', source: 'nyc', isSaved: true, applicationStatus: 'applied' },
      searchResults: [
        { jobId: '1', source: 'nyc', isSaved: true },
        { jobId: '9', source: 'nyc', isSaved: true },
      ],
    };

    const next = reducer(
      state,
      fulfilled(unsaveJob, 'A', { jobId: '1', source: 'nyc' })
    );

    expect(next.currentJob.isSaved).toBe(false);
    expect(next.currentJob.applicationStatus).toBeNull();
    expect(next.currentJob.statusHistory).toEqual([]);
    expect(next.searchResults[0].isSaved).toBe(false);
    expect(next.searchResults[1].isSaved).toBe(true);
  });
});

describe('jobsSlice — logout', () => {
  it('resets user-specific state but keeps search results', () => {
    const state = {
      ...initialState,
      currentJob: { jobId: '1' },
      savedJobs: [{ jobId: '1' }],
      jobNotes: [{ _id: 'n1' }],
      savedPagination: { page: 3, limit: 20, total: 50, pages: 3 },
      statusFilter: 'applied',
      newSinceLastSeen: 5,
      searchError: 'x',
      detailsError: 'x',
      savedJobsError: 'x',
      saveError: 'x',
      searchResults: [{ jobId: '42' }],
    };

    const next = reducer(state, logout());

    expect(next.currentJob).toBeNull();
    expect(next.savedJobs).toEqual([]);
    expect(next.jobNotes).toEqual([]);
    expect(next.savedPagination).toEqual(initialState.savedPagination);
    expect(next.statusFilter).toBe('');
    expect(next.newSinceLastSeen).toBe(0);
    expect(next.searchError).toBeNull();
    expect(next.detailsError).toBeNull();
    expect(next.savedJobsError).toBeNull();
    expect(next.saveError).toBeNull();
    // Public search results are not user-specific
    expect(next.searchResults).toEqual([{ jobId: '42' }]);
  });
});
