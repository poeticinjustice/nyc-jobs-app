import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { logout } from './authSlice';

export const getSavedSearches = createAsyncThunk(
  'searches/getSavedSearches',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/searches');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get saved searches'
      );
    }
  }
);

export const saveSearch = createAsyncThunk(
  'searches/saveSearch',
  async ({ name, criteria }, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/searches', { name, criteria });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to save search'
      );
    }
  }
);

export const deleteSavedSearch = createAsyncThunk(
  'searches/deleteSavedSearch',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/api/searches/${id}`);
      return { id };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete search'
      );
    }
  }
);

export const fetchSavedSearch = createAsyncThunk(
  'searches/fetchSavedSearch',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/searches/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to load saved search'
      );
    }
  }
);

export const getSearchMatches = createAsyncThunk(
  'searches/getSearchMatches',
  async ({ id, limit = 10 }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/searches/${id}/matches`, { params: { limit } });
      return { id, ...response.data };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to load new matches'
      );
    }
  }
);

export const toggleSearchAlerts = createAsyncThunk(
  'searches/toggleSearchAlerts',
  async ({ id, enabled }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/api/searches/${id}/alerts`, { enabled });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update alerts'
      );
    }
  }
);

export const markSearchSeen = createAsyncThunk(
  'searches/markSearchSeen',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/searches/${id}/seen`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to mark search as seen'
      );
    }
  }
);

const initialState = {
  savedSearches: [],
  matchesBySearch: {},
  emailAlertsAvailable: false,
  loading: false,
  error: null,
};

const searchesSlice = createSlice({
  name: 'searches',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(getSavedSearches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSavedSearches.fulfilled, (state, action) => {
        state.loading = false;
        state.savedSearches = action.payload.searches;
        state.emailAlertsAvailable = Boolean(action.payload.emailAlertsAvailable);
      })
      .addCase(getSavedSearches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(saveSearch.fulfilled, (state, action) => {
        state.error = null;
        state.savedSearches.unshift(action.payload.search);
      })
      .addCase(saveSearch.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(deleteSavedSearch.fulfilled, (state, action) => {
        state.error = null;
        state.savedSearches = state.savedSearches.filter(
          (s) => s._id !== action.payload.id
        );
      })
      .addCase(deleteSavedSearch.rejected, (state, action) => {
        state.error = action.payload;
      })

      .addCase(fetchSavedSearch.fulfilled, (state, action) => {
        const incoming = action.payload.search;
        const idx = state.savedSearches.findIndex((s) => s._id === incoming._id);
        if (idx >= 0) state.savedSearches[idx] = incoming;
      })
      .addCase(getSearchMatches.fulfilled, (state, action) => {
        state.matchesBySearch[action.payload.id] = action.payload.jobs;
      })
      .addCase(toggleSearchAlerts.fulfilled, (state, action) => {
        state.error = null;
        state.emailAlertsAvailable = Boolean(action.payload.emailAlertsAvailable);
        const incoming = action.payload.search;
        const idx = state.savedSearches.findIndex((s) => s._id === incoming._id);
        // Preserve the derived newCount, which this response doesn't carry
        if (idx >= 0) {
          state.savedSearches[idx] = {
            ...incoming,
            newCount: state.savedSearches[idx].newCount,
          };
        }
      })
      .addCase(toggleSearchAlerts.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(markSearchSeen.fulfilled, (state, action) => {
        const incoming = action.payload.search;
        const idx = state.savedSearches.findIndex((s) => s._id === incoming._id);
        if (idx >= 0) state.savedSearches[idx] = { ...incoming, newCount: 0 };
      })

      // Reset on logout
      .addCase(logout, () => initialState);
  },
});

export default searchesSlice.reducer;
