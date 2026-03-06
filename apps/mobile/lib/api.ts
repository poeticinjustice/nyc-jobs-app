import axios from 'axios';
import { API_BASE_URL } from './config';
import { storage } from './storage';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Keep token in memory so the request interceptor is synchronous and reliable.
// storage (AsyncStorage) is used only for persistence across app restarts.
let memoryToken: string | null = null;

export const setToken = (token: string | null) => {
  memoryToken = token;
  if (token) {
    storage.setItem('token', token);
  } else {
    storage.removeItem('token');
  }
};

export const loadToken = async (): Promise<string | null> => {
  if (memoryToken) return memoryToken;
  memoryToken = await storage.getItem('token');
  return memoryToken;
};

api.interceptors.request.use((config) => {
  if (memoryToken) {
    config.headers.Authorization = `Bearer ${memoryToken}`;
  }
  return config;
});

// 401 response interceptor — clear token so stale auth doesn't persist
let onUnauthorized: (() => void) | null = null;

export const setOnUnauthorized = (cb: () => void) => {
  onUnauthorized = cb;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      setToken(null);
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default api;
