import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Sidebar state
  sidebar: {
    isOpen: false,
    activeTab: 'search',
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebar.isOpen = !state.sidebar.isOpen;
    },

    setSidebarTab: (state, action) => {
      state.sidebar.activeTab = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarTab,
} = uiSlice.actions;

export default uiSlice.reducer;
