import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { logout } from './authSlice';

export const getDashboard = createAsyncThunk(
  'dashboard/getDashboard',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/dashboard');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to load dashboard'
      );
    }
  }
);

const initialState = {
  statusCounts: null,
  totalSavedJobs: 0,
  totalNotes: 0,
  totalSavedSearches: 0,
  recentSavedJobs: [],
  recentNotes: [],
  loading: false,
  error: null,
  // Nulled by the logout reset below, which is what invalidates any response
  // still in flight for the previous user.
  latestRequestId: null,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Guarded by request id like the job lists. logout resets to
      // initialState, but a response already in flight for the previous user
      // would otherwise land afterwards and repopulate the dashboard — the
      // next person to sign in on a shared machine saw the previous user's
      // counts and recent items until their own fetch returned.
      .addCase(getDashboard.pending, (state, action) => {
        state.latestRequestId = action.meta.requestId;
        state.loading = true;
        state.error = null;
      })
      .addCase(getDashboard.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.loading = false;
        state.error = null;
        state.statusCounts = action.payload.statusCounts;
        state.totalSavedJobs = action.payload.totalSavedJobs;
        state.totalNotes = action.payload.totalNotes;
        state.totalSavedSearches = action.payload.totalSavedSearches;
        state.recentSavedJobs = action.payload.recentSavedJobs;
        state.recentNotes = action.payload.recentNotes;
      })
      .addCase(getDashboard.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.loading = false;
        state.error = action.payload;
      })

      // Reset on logout
      .addCase(logout, () => initialState);
  },
});

export default dashboardSlice.reducer;
