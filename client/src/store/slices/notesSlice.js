import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { logout } from './authSlice';

// Async thunks
export const createNote = createAsyncThunk(
  'notes/createNote',
  async (noteData, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/notes', noteData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create note'
      );
    }
  }
);

export const getNotes = createAsyncThunk(
  'notes/getNotes',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/notes', { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get notes'
      );
    }
  }
);

export const updateNote = createAsyncThunk(
  'notes/updateNote',
  async ({ noteId, noteData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/notes/${noteId}`, noteData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update note'
      );
    }
  }
);

export const deleteNote = createAsyncThunk(
  'notes/deleteNote',
  async (noteId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/api/notes/${noteId}`);
      return { noteId, message: response.data.message };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete note'
      );
    }
  }
);

const initialState = {
  notes: [],
  filters: {
    type: '',
    priority: '',
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  loading: false,
  error: null,
  createLoading: false,
  updateLoading: false,
  deleteLoading: false,
};

const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create Note
      .addCase(createNote.pending, (state) => {
        state.createLoading = true;
        state.error = null;
      })
      .addCase(createNote.fulfilled, (state, action) => {
        state.createLoading = false;
        if (state.pagination.page === 1) {
          state.notes.unshift(action.payload.note);
          if (state.notes.length > state.pagination.limit) {
            state.notes.pop();
          }
        }
        state.pagination.total += 1;
        state.pagination.pages = Math.ceil(
          state.pagination.total / state.pagination.limit
        );
        state.error = null;
      })
      .addCase(createNote.rejected, (state, action) => {
        state.createLoading = false;
        state.error = action.payload;
      })

      // Get Notes
      .addCase(getNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getNotes.fulfilled, (state, action) => {
        state.loading = false;
        state.notes = action.payload.notes;
        state.pagination = action.payload.pagination;
        state.error = null;
      })
      .addCase(getNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update Note
      .addCase(updateNote.pending, (state) => {
        state.updateLoading = true;
        state.error = null;
      })
      .addCase(updateNote.fulfilled, (state, action) => {
        state.updateLoading = false;
        const index = state.notes.findIndex(
          (note) => note._id === action.payload.note._id
        );
        if (index !== -1) {
          state.notes[index] = action.payload.note;
        }
        state.error = null;
      })
      .addCase(updateNote.rejected, (state, action) => {
        state.updateLoading = false;
        state.error = action.payload;
      })

      // Delete Note
      .addCase(deleteNote.pending, (state) => {
        state.deleteLoading = true;
        state.error = null;
      })
      .addCase(deleteNote.fulfilled, (state, action) => {
        state.deleteLoading = false;
        const { noteId } = action.payload;
        state.notes = state.notes.filter((note) => note._id !== noteId);
        if (state.pagination.total > 0) {
          state.pagination.total -= 1;
          state.pagination.pages = Math.ceil(
            state.pagination.total / state.pagination.limit
          );
        }
        state.error = null;
      })
      .addCase(deleteNote.rejected, (state, action) => {
        state.deleteLoading = false;
        state.error = action.payload;
      })

      // Reset on logout
      .addCase(logout, () => initialState);
  },
});

export const {
  setFilters,
  clearError,
} = notesSlice.actions;

export default notesSlice.reducer;
