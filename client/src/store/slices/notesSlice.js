import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// Async thunks
export const createNote = createAsyncThunk(
  'notes/createNote',
  async (noteData, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/notes', noteData, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/notes', {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get notes'
      );
    }
  }
);

export const getNoteById = createAsyncThunk(
  'notes/getNoteById',
  async (noteId, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/notes/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get note'
      );
    }
  }
);

export const updateNote = createAsyncThunk(
  'notes/updateNote',
  async ({ noteId, noteData }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`/api/notes/${noteId}`, noteData, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const token = localStorage.getItem('token');
      const response = await axios.delete(`/api/notes/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { noteId, message: response.data.message };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete note'
      );
    }
  }
);

export const getJobNotes = createAsyncThunk(
  'notes/getJobNotes',
  async ({ jobId, params = {} }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/notes/job/${jobId}`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      return { jobId, ...response.data };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get job notes'
      );
    }
  }
);

export const getNoteStats = createAsyncThunk(
  'notes/getNoteStats',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/notes/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to get note statistics'
      );
    }
  }
);

const initialState = {
  notes: [],
  currentNote: null,
  jobNotes: {},
  stats: null,
  filters: {
    jobId: '',
    type: '',
    priority: '',
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
  createLoading: false,
  updateLoading: false,
  deleteLoading: false,
};

const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload, page: 1 };
    },
    clearNotes: (state) => {
      state.notes = [];
      state.pagination = initialState.pagination;
    },
    clearCurrentNote: (state) => {
      state.currentNote = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    addNote: (state, action) => {
      state.notes.unshift(action.payload);
    },
    updateNoteInList: (state, action) => {
      const { noteId, noteData } = action.payload;
      const index = state.notes.findIndex((note) => note._id === noteId);
      if (index !== -1) {
        state.notes[index] = { ...state.notes[index], ...noteData };
      }
    },
    removeNoteFromList: (state, action) => {
      const noteId = action.payload;
      state.notes = state.notes.filter((note) => note._id !== noteId);
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
        state.notes.unshift(action.payload.note);
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

      // Get Note By ID
      .addCase(getNoteById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getNoteById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentNote = action.payload.note;
        state.error = null;
      })
      .addCase(getNoteById.rejected, (state, action) => {
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
        state.currentNote = action.payload.note;
        // Update in notes list
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
        if (state.currentNote && state.currentNote._id === noteId) {
          state.currentNote = null;
        }
        state.error = null;
      })
      .addCase(deleteNote.rejected, (state, action) => {
        state.deleteLoading = false;
        state.error = action.payload;
      })

      // Get Job Notes
      .addCase(getJobNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getJobNotes.fulfilled, (state, action) => {
        state.loading = false;
        const { jobId, notes, pagination } = action.payload;
        state.jobNotes[jobId] = { notes, pagination };
        state.error = null;
      })
      .addCase(getJobNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Get Note Stats
      .addCase(getNoteStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getNoteStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload;
        state.error = null;
      })
      .addCase(getNoteStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  setFilters,
  clearNotes,
  clearCurrentNote,
  clearError,
  addNote,
  updateNoteInList,
  removeNoteFromList,
} = notesSlice.actions;

export default notesSlice.reducer;
