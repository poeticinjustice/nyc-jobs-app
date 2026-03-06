import axios from 'axios';
import { API_BASE_URL } from './config';
import { storage } from './storage';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await storage.getItem('token');

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  return config;
});

// 401 response interceptor — clear stored token so stale auth doesn't persist
let onUnauthorized: (() => void) | null = null;

export const setOnUnauthorized = (cb: () => void) => {
  onUnauthorized = cb;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await storage.removeItem('token');
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default api;
