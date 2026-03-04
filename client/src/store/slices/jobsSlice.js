import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

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
      console.error('Error in searchJobs thunk:', error);
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
      return { jobId, source, message: response.data.message };
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
      return { jobId, message: response.data.message };
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

export const getJobCategories = createAsyncThunk(
  'jobs/getJobCategories',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/jobs/categories');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get job categories'
      );
    }
  }
);

export const updateJobStatus = createAsyncThunk(
  'jobs/updateJobStatus',
  async ({ jobId, status, source }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/jobs/${jobId}/status`, { status, source });
      return { jobId, ...response.data };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update status'
      );
    }
  }
);

export const getJobAgencies = createAsyncThunk(
  'jobs/getJobAgencies',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/jobs/agencies');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get agencies'
      );
    }
  }
);

const initialState = {
  searchResults: [],
  currentJob: null,
  savedJobs: [],
  categories: [],
  agencies: [],
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
  loading: false,
  error: null,
  searchLoading: false,
  saveLoading: false,
  statusLoading: false,
};

const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.searchPagination = initialState.searchPagination;
    },
    clearCurrentJob: (state) => {
      state.currentJob = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setStatusFilter: (state, action) => {
      state.statusFilter = action.payload;
    },
    updateJobSavedStatus: (state, action) => {
      const { jobId, isSaved } = action.payload;

      const searchJob = state.searchResults.find((job) => job.jobId === jobId);
      if (searchJob) {
        searchJob.isSaved = isSaved;
      }

      if (state.currentJob && state.currentJob.jobId === jobId) {
        state.currentJob.isSaved = isSaved;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Search Jobs
      .addCase(searchJobs.pending, (state) => {
        state.searchLoading = true;
        state.error = null;
      })
      .addCase(searchJobs.fulfilled, (state, action) => {
        state.searchLoading = false;
        state.searchResults = action.payload.jobs;
        state.searchPagination = action.payload.pagination;
        state.error = null;
      })
      .addCase(searchJobs.rejected, (state, action) => {
        state.searchLoading = false;
        state.error = action.payload;
      })

      // Get Job Details
      .addCase(getJobDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getJobDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.currentJob = action.payload;
        state.error = null;
      })
      .addCase(getJobDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Save Job
      .addCase(saveJob.pending, (state) => {
        state.saveLoading = true;
        state.error = null;
      })
      .addCase(saveJob.fulfilled, (state, action) => {
        state.saveLoading = false;
        state.error = null;
        const { jobId } = action.payload;
        if (state.currentJob && state.currentJob.jobId === jobId) {
          state.currentJob.isSaved = true;
          state.currentJob.applicationStatus = 'interested';
        }
        const searchJob = state.searchResults.find(
          (job) => job.jobId === jobId
        );
        if (searchJob) {
          searchJob.isSaved = true;
        }
      })
      .addCase(saveJob.rejected, (state, action) => {
        state.saveLoading = false;
        state.error = action.payload;
      })

      // Unsave Job
      .addCase(unsaveJob.pending, (state) => {
        state.saveLoading = true;
        state.error = null;
      })
      .addCase(unsaveJob.fulfilled, (state, action) => {
        state.saveLoading = false;
        state.error = null;
        const { jobId } = action.payload;
        if (state.currentJob && state.currentJob.jobId === jobId) {
          state.currentJob.isSaved = false;
        }
        const searchJob = state.searchResults.find(
          (job) => job.jobId === jobId
        );
        if (searchJob) {
          searchJob.isSaved = false;
        }
        state.savedJobs = state.savedJobs.filter(
          (job) => job.jobId !== jobId
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
        state.error = action.payload;
      })

      // Update Job Status
      .addCase(updateJobStatus.pending, (state) => {
        state.statusLoading = true;
        state.error = null;
      })
      .addCase(updateJobStatus.fulfilled, (state, action) => {
        state.statusLoading = false;
        state.error = null;
        const { jobId, applicationStatus, statusHistory } = action.payload;
        const savedJob = state.savedJobs.find((job) => job.jobId === jobId);
        if (savedJob) {
          savedJob.applicationStatus = applicationStatus;
        }
        if (state.currentJob && state.currentJob.jobId === jobId) {
          state.currentJob.applicationStatus = applicationStatus;
          if (statusHistory) {
            state.currentJob.statusHistory = statusHistory;
          }
        }
      })
      .addCase(updateJobStatus.rejected, (state, action) => {
        state.statusLoading = false;
        state.error = action.payload;
      })

      // Get Saved Jobs
      .addCase(getSavedJobs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSavedJobs.fulfilled, (state, action) => {
        state.loading = false;
        state.savedJobs = action.payload.jobs;
        state.savedPagination = action.payload.pagination;
        state.error = null;
      })
      .addCase(getSavedJobs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Get Job Categories
      .addCase(getJobCategories.fulfilled, (state, action) => {
        state.categories = action.payload.categories;
      })

      // Get Job Agencies
      .addCase(getJobAgencies.fulfilled, (state, action) => {
        state.agencies = action.payload.agencies;
      });
  },
});

export const {
  clearSearchResults,
  clearCurrentJob,
  clearError,
  setStatusFilter,
  updateJobSavedStatus,
} = jobsSlice.actions;

export default jobsSlice.reducer;
