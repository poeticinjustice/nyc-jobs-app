import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { logout } from './authSlice';

// Async thunks
export const searchJobs = createAsyncThunk(
  'jobs/searchJobs',
  async (searchParams, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/jobs/search', {
        params: searchParams,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to search jobs'
      );
    }
  }
);

export const getJobDetails = createAsyncThunk(
  'jobs/getJobDetails',
  async ({ jobId, source }, { rejectWithValue }) => {
    try {
      const params = source ? { source } : {};
      const response = await api.get(`/api/jobs/${jobId}`, { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get job details'
      );
    }
  }
);

export const saveJob = createAsyncThunk(
  'jobs/saveJob',
  async ({ jobId, source, jobData }, { rejectWithValue }) => {
    try {
      const body = { source: source || 'nyc' };
      if (jobData) body.jobData = jobData;
      const response = await api.post(`/api/jobs/${jobId}/save`, body);
      const { applicationStatus, statusHistory } = response.data;
      return { jobId, source, applicationStatus, statusHistory };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to save job'
      );
    }
  }
);

export const unsaveJob = createAsyncThunk(
  'jobs/unsaveJob',
  async ({ jobId, source }, { rejectWithValue }) => {
    try {
      const params = source ? { source } : {};
      const response = await api.delete(`/api/jobs/${jobId}/save`, { params });
      return { jobId, source, message: response.data.message };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to unsave job'
      );
    }
  }
);

export const getSavedJobs = createAsyncThunk(
  'jobs/getSavedJobs',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/jobs/saved', { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get saved jobs'
      );
    }
  }
);

export const updateJobStatus = createAsyncThunk(
  'jobs/updateJobStatus',
  async ({ jobId, status, source }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/jobs/${jobId}/status`, { status, source });
      const { applicationStatus, statusHistory } = response.data;
      return { jobId, source, applicationStatus, statusHistory };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update status'
      );
    }
  }
);

export const updateJobTracking = createAsyncThunk(
  'jobs/updateJobTracking',
  async ({ jobId, source, trackingData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/jobs/${jobId}/tracking`, {
        ...trackingData,
        source,
      });
      return { jobId, source, ...response.data };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update tracking info'
      );
    }
  }
);

export const getJobNotes = createAsyncThunk(
  'jobs/getJobNotes',
  async ({ jobId }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/notes/job/${jobId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get job notes'
      );
    }
  }
);

export const bulkUpdateJobStatus = createAsyncThunk(
  'jobs/bulkUpdateJobStatus',
  async ({ jobs, status }, { rejectWithValue }) => {
    try {
      const response = await api.put('/api/jobs/saved/bulk-status', { jobs, status });
      return { ...response.data, jobs, status };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update statuses'
      );
    }
  }
);

export const markJobsSeen = createAsyncThunk(
  'jobs/markJobsSeen',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/jobs/seen');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to mark jobs as seen'
      );
    }
  }
);

const initialState = {
  searchResults: [],
  currentJob: null,
  savedJobs: [],
  jobNotes: [],
  jobNotesLoading: false,
  searchPagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  savedPagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  statusFilter: '',
  newSinceLastSeen: 0,
  searchLatestRequestId: null,
  detailsLatestRequestId: null,
  savedJobsLatestRequestId: null,
  searchLoading: false,
  detailsLoading: false,
  savedJobsLoading: false,
  saveLoading: false,
  statusLoading: false,
  trackingLoading: false,
  searchError: null,
  detailsError: null,
  savedJobsError: null,
  saveError: null,
};

const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.searchPagination = initialState.searchPagination;
    },
    setStatusFilter: (state, action) => {
      state.statusFilter = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Search Jobs
      .addCase(searchJobs.pending, (state, action) => {
        state.searchLatestRequestId = action.meta.requestId;
        state.searchLoading = true;
        state.searchError = null;
      })
      .addCase(searchJobs.fulfilled, (state, action) => {
        // Ignore stale responses — only the latest request may update state
        if (action.meta.requestId !== state.searchLatestRequestId) return;
        state.searchLoading = false;
        state.searchResults = action.payload.jobs;
        state.searchPagination = action.payload.pagination;
        state.newSinceLastSeen = action.payload.newSinceLastSeen || 0;
      })
      .addCase(searchJobs.rejected, (state, action) => {
        if (action.meta.requestId !== state.searchLatestRequestId) return;
        state.searchLoading = false;
        state.searchError = action.payload;
      })

      // Get Job Details — clear currentJob in pending to avoid flash
      .addCase(getJobDetails.pending, (state, action) => {
        state.detailsLatestRequestId = action.meta.requestId;
        state.detailsLoading = true;
        state.detailsError = null;
        state.currentJob = null;
        state.jobNotes = [];
      })
      .addCase(getJobDetails.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.detailsLatestRequestId) return;
        state.detailsLoading = false;
        state.currentJob = action.payload;
      })
      .addCase(getJobDetails.rejected, (state, action) => {
        if (action.meta.requestId !== state.detailsLatestRequestId) return;
        state.detailsLoading = false;
        state.detailsError = action.payload;
      })

      // Save Job
      .addCase(saveJob.pending, (state) => {
        state.saveLoading = true;
        state.saveError = null;
      })
      .addCase(saveJob.fulfilled, (state, action) => {
        state.saveLoading = false;
        const { jobId, source, applicationStatus, statusHistory } = action.payload;
        if (state.currentJob && state.currentJob.jobId === jobId &&
            (!source || state.currentJob.source === source)) {
          state.currentJob.isSaved = true;
          state.currentJob.applicationStatus = applicationStatus || 'interested';
          if (statusHistory) state.currentJob.statusHistory = statusHistory;
        }
        const searchJob = state.searchResults.find(
          (job) => job.jobId === jobId && (!source || job.source === source)
        );
        if (searchJob) {
          searchJob.isSaved = true;
        }
      })
      .addCase(saveJob.rejected, (state, action) => {
        state.saveLoading = false;
        state.saveError = action.payload;
      })

      // Unsave Job
      .addCase(unsaveJob.pending, (state) => {
        state.saveLoading = true;
        state.saveError = null;
      })
      .addCase(unsaveJob.fulfilled, (state, action) => {
        state.saveLoading = false;
        const { jobId, source } = action.payload;
        if (state.currentJob && state.currentJob.jobId === jobId &&
            (!source || state.currentJob.source === source)) {
          state.currentJob.isSaved = false;
          state.currentJob.applicationStatus = null;
          state.currentJob.statusHistory = [];
        }
        const searchJob = state.searchResults.find(
          (job) => job.jobId === jobId && (!source || job.source === source)
        );
        if (searchJob) {
          searchJob.isSaved = false;
        }
        state.savedJobs = state.savedJobs.filter(
          (job) => !(job.jobId === jobId && (!source || job.source === source))
        );
        if (state.savedPagination.total > 0) {
          state.savedPagination.total -= 1;
          state.savedPagination.pages = Math.ceil(
            state.savedPagination.total / state.savedPagination.limit
          );
        }
      })
      .addCase(unsaveJob.rejected, (state, action) => {
        state.saveLoading = false;
        state.saveError = action.payload;
      })

      // Update Job Status
      .addCase(updateJobStatus.pending, (state) => {
        state.statusLoading = true;
        state.saveError = null;
      })
      .addCase(updateJobStatus.fulfilled, (state, action) => {
        state.statusLoading = false;
        const { jobId, source, applicationStatus, statusHistory } = action.payload;
        const savedJob = state.savedJobs.find(
          (job) => job.jobId === jobId && (!source || job.source === source)
        );
        if (savedJob) {
          savedJob.applicationStatus = applicationStatus;
          if (statusHistory) {
            savedJob.statusHistory = statusHistory;
          }
        }
        if (state.currentJob && state.currentJob.jobId === jobId &&
            (!source || state.currentJob.source === source)) {
          state.currentJob.applicationStatus = applicationStatus;
          if (statusHistory) {
            state.currentJob.statusHistory = statusHistory;
          }
        }
      })
      .addCase(updateJobStatus.rejected, (state, action) => {
        state.statusLoading = false;
        state.saveError = action.payload;
      })

      // Update Job Tracking
      .addCase(updateJobTracking.pending, (state) => {
        state.trackingLoading = true;
        state.saveError = null;
      })
      .addCase(updateJobTracking.fulfilled, (state, action) => {
        state.trackingLoading = false;
        const { jobId, source, applicationDate, interviewDate, followUpDate, documentLinks } = action.payload;

        const savedJob = state.savedJobs.find(
          (job) => job.jobId === jobId && (!source || job.source === source)
        );
        if (savedJob) {
          savedJob.applicationDate = applicationDate;
          savedJob.interviewDate = interviewDate;
          savedJob.followUpDate = followUpDate;
          savedJob.documentLinks = documentLinks;
        }

        if (state.currentJob && state.currentJob.jobId === jobId &&
            (!source || state.currentJob.source === source)) {
          state.currentJob.applicationDate = applicationDate;
          state.currentJob.interviewDate = interviewDate;
          state.currentJob.followUpDate = followUpDate;
          state.currentJob.documentLinks = documentLinks;
        }
      })
      .addCase(updateJobTracking.rejected, (state, action) => {
        state.trackingLoading = false;
        state.saveError = action.payload;
      })

      // Get Job Notes
      .addCase(getJobNotes.pending, (state) => {
        state.jobNotesLoading = true;
      })
      .addCase(getJobNotes.fulfilled, (state, action) => {
        state.jobNotesLoading = false;
        state.jobNotes = action.payload.notes;
      })
      .addCase(getJobNotes.rejected, (state) => {
        state.jobNotesLoading = false;
        state.jobNotes = [];
      })

      // Get Saved Jobs
      .addCase(getSavedJobs.pending, (state, action) => {
        state.savedJobsLatestRequestId = action.meta.requestId;
        state.savedJobsLoading = true;
        state.savedJobsError = null;
      })
      .addCase(getSavedJobs.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.savedJobsLatestRequestId) return;
        state.savedJobsLoading = false;
        state.savedJobs = action.payload.jobs;
        state.savedPagination = action.payload.pagination;
      })
      .addCase(getSavedJobs.rejected, (state, action) => {
        if (action.meta.requestId !== state.savedJobsLatestRequestId) return;
        state.savedJobsLoading = false;
        state.savedJobsError = action.payload;
      })

      .addCase(bulkUpdateJobStatus.fulfilled, (state, action) => {
        const { jobs, status } = action.payload;
        const touched = new Set(
          jobs.map((j) => `${j.source || 'nyc'}:${j.jobId}`)
        );
        state.savedJobs = state.savedJobs.map((job) =>
          touched.has(`${job.source || 'nyc'}:${job.jobId}`)
            ? { ...job, applicationStatus: status }
            : job
        );
      })
      .addCase(bulkUpdateJobStatus.rejected, (state, action) => {
        state.saveError = action.payload;
      })

      .addCase(markJobsSeen.fulfilled, (state) => {
        state.newSinceLastSeen = 0;
        state.searchResults = state.searchResults.map((job) => ({
          ...job,
          isNew: false,
        }));
      })

      // Reset user-specific state on logout
      .addCase(logout, (state) => {
        state.currentJob = null;
        state.savedJobs = [];
        state.jobNotes = [];
        state.savedPagination = initialState.savedPagination;
        state.statusFilter = '';
        state.newSinceLastSeen = 0;
        state.searchError = null;
        state.detailsError = null;
        state.savedJobsError = null;
        state.saveError = null;
      });
  },
});

export const {
  clearSearchResults,
  setStatusFilter,
} = jobsSlice.actions;

export default jobsSlice.reducer;
