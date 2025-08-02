import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Modal states
  modals: {
    loginModal: false,
    registerModal: false,
    jobDetailsModal: false,
    noteModal: false,
    profileModal: false,
    confirmDeleteModal: false,
  },

  // Sidebar state
  sidebar: {
    isOpen: false,
    activeTab: 'search',
  },

  // Notifications
  notifications: [],

  // Loading states
  loading: {
    global: false,
    search: false,
    save: false,
  },

  // Theme and preferences
  theme: {
    mode: 'light', // 'light' or 'dark'
    sidebarCollapsed: false,
  },

  // Search and filters
  search: {
    isAdvancedSearchOpen: false,
    lastSearchQuery: '',
    searchHistory: [],
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Modal actions
    openModal: (state, action) => {
      const modalName = action.payload;
      state.modals[modalName] = true;
    },

    closeModal: (state, action) => {
      const modalName = action.payload;
      state.modals[modalName] = false;
    },

    closeAllModals: (state) => {
      Object.keys(state.modals).forEach((key) => {
        state.modals[key] = false;
      });
    },

    // Sidebar actions
    toggleSidebar: (state) => {
      state.sidebar.isOpen = !state.sidebar.isOpen;
    },

    setSidebarTab: (state, action) => {
      state.sidebar.activeTab = action.payload;
    },

    // Notification actions
    addNotification: (state, action) => {
      const notification = {
        id: Date.now(),
        type: 'info', // 'success', 'error', 'warning', 'info'
        message: '',
        duration: 5000,
        ...action.payload,
      };
      state.notifications.push(notification);
    },

    removeNotification: (state, action) => {
      const notificationId = action.payload;
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== notificationId
      );
    },

    clearNotifications: (state) => {
      state.notifications = [];
    },

    // Loading actions
    setGlobalLoading: (state, action) => {
      state.loading.global = action.payload;
    },

    setSearchLoading: (state, action) => {
      state.loading.search = action.payload;
    },

    setSaveLoading: (state, action) => {
      state.loading.save = action.payload;
    },

    // Theme actions
    toggleTheme: (state) => {
      state.theme.mode = state.theme.mode === 'light' ? 'dark' : 'light';
    },

    setTheme: (state, action) => {
      state.theme.mode = action.payload;
    },

    toggleSidebarCollapsed: (state) => {
      state.theme.sidebarCollapsed = !state.theme.sidebarCollapsed;
    },

    // Search actions
    toggleAdvancedSearch: (state) => {
      state.search.isAdvancedSearchOpen = !state.search.isAdvancedSearchOpen;
    },

    setLastSearchQuery: (state, action) => {
      state.search.lastSearchQuery = action.payload;
    },

    addToSearchHistory: (state, action) => {
      const query = action.payload;
      if (query && !state.search.searchHistory.includes(query)) {
        state.search.searchHistory.unshift(query);
        // Keep only last 10 searches
        if (state.search.searchHistory.length > 10) {
          state.search.searchHistory = state.search.searchHistory.slice(0, 10);
        }
      }
    },

    clearSearchHistory: (state) => {
      state.search.searchHistory = [];
    },

    // Reset UI state
    resetUI: (state) => {
      state.modals = initialState.modals;
      state.sidebar = initialState.sidebar;
      state.notifications = [];
      state.loading = initialState.loading;
      state.search = initialState.search;
    },
  },
});

export const {
  openModal,
  closeModal,
  closeAllModals,
  toggleSidebar,
  setSidebarTab,
  addNotification,
  removeNotification,
  clearNotifications,
  setGlobalLoading,
  setSearchLoading,
  setSaveLoading,
  toggleTheme,
  setTheme,
  toggleSidebarCollapsed,
  toggleAdvancedSearch,
  setLastSearchQuery,
  addToSearchHistory,
  clearSearchHistory,
  resetUI,
} = uiSlice.actions;

export default uiSlice.reducer;
