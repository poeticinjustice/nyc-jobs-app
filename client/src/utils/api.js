import axios from 'axios';

const api = axios.create();

// Attach auth token to every request if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 responses, clear token and reset Redux auth state
let storeRef = null;
export const setupInterceptors = (store) => {
  storeRef = store;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (storeRef) {
        storeRef.dispatch({ type: 'auth/logout' });
      }
    }
    return Promise.reject(error);
  }
);

export default api;
