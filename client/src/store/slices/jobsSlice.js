import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// Async thunks
export const searchJobs = createAsyncThunk(
  'jobs/searchJobs',
  async (searchParams, { rejectWithValue, getState }) => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get('/api/jobs/search', {
        params: searchParams,
        headers,
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
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get(`/api/jobs/${jobId}`, { headers });
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
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(
        `/api/jobs/${jobId}/save`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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
      const token = localStorage.getItem('token');
      const response = await axios.delete(`/api/jobs/${jobId}/save`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/jobs/saved', {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const response = await axios.get('/api/jobs/categories');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get job categories'
      );
    }
  }
);

const initialState = {
  searchResults: [],
  currentJob: null,
  savedJobs: [],
  categories: [],
  searchParams: {
    q: '',
    category: '',
    location: '',
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

      // Update in search results
      const searchJob = state.searchResults.find((job) => job.job_id === jobId);
      if (searchJob) {
        searchJob.isSaved = isSaved;
      }

      // Update current job
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
        state.currentJob = action.payload; // Remove .job
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
        // Update saved status in current job and search results
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
        // Update saved jobs list
        const savedJob = state.searchResults.find(
          (job) => job.job_id === jobId
        );
        if (savedJob && !state.savedJobs.find((job) => job.job_id === jobId)) {
          state.savedJobs.push(savedJob);
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
        // Update saved status in current job and search results
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
        // Remove from saved jobs list - try both jobId and job_id
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
      .addCase(getJobCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getJobCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.categories = action.payload.categories;
        state.error = null;
      })
      .addCase(getJobCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
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
