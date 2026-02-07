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
  async (jobId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/jobs/${jobId}`);
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
  async (jobId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/jobs/${jobId}/save`);
      return { jobId, message: response.data.message };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to save job'
      );
    }
  }
);

export const unsaveJob = createAsyncThunk(
  'jobs/unsaveJob',
  async (jobId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/api/jobs/${jobId}/save`);
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
  searchParams: {
    q: '',
    category: '',
    location: '',
    agency: '',
    salary_min: '',
    salary_max: '',
    page: 1,
    limit: 20,
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  loading: false,
  error: null,
  searchLoading: false,
  saveLoading: false,
};

const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {
    setSearchParams: (state, action) => {
      state.searchParams = {
        ...state.searchParams,
        ...action.payload,
        page: 1,
      };
    },
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.pagination = initialState.pagination;
    },
    clearCurrentJob: (state) => {
      state.currentJob = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    updateJobSavedStatus: (state, action) => {
      const { jobId, isSaved } = action.payload;

      const searchJob = state.searchResults.find((job) => job.job_id === jobId);
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
        state.pagination = action.payload.pagination;
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
        }
        const searchJob = state.searchResults.find(
          (job) => job.job_id === jobId
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
          (job) => job.job_id === jobId
        );
        if (searchJob) {
          searchJob.isSaved = false;
        }
        state.savedJobs = state.savedJobs.filter((job) => {
          const jobIdentifier = job.jobId || job.job_id;
          return jobIdentifier !== jobId;
        });
      })
      .addCase(unsaveJob.rejected, (state, action) => {
        state.saveLoading = false;
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
        state.pagination = action.payload.pagination;
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
  setSearchParams,
  clearSearchResults,
  clearCurrentJob,
  clearError,
  updateJobSavedStatus,
} = jobsSlice.actions;

export default jobsSlice.reducer;
