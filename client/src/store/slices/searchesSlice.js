import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

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

const initialState = {
  savedSearches: [],
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
      })
      .addCase(getSavedSearches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(saveSearch.fulfilled, (state, action) => {
        state.savedSearches.unshift(action.payload.search);
      })
      .addCase(deleteSavedSearch.fulfilled, (state, action) => {
        state.savedSearches = state.savedSearches.filter(
          (s) => s._id !== action.payload.id
        );
      });
  },
});

export default searchesSlice.reducer;
