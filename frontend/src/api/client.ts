import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// API base URL defaults to local Django dev server
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * Token Storage tradeoff notice:
 * In accordance with security recommendations, tokens are NOT stored in localStorage
 * to mitigate persistent XSS vulnerabilities. We use sessionStorage as a middle ground
 * so that session survives in-tab page reloads while automatically clearing on tab/window close.
 */
export const TOKEN_STORAGE = {
  getAccessToken: (): string | null => sessionStorage.getItem('access_token'),
  getRefreshToken: (): string | null => sessionStorage.getItem('refresh_token'),
  setTokens: (access: string, refresh: string) => {
    sessionStorage.setItem('access_token', access);
    sessionStorage.setItem('refresh_token', refresh);
  },
  clearTokens: () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
  },
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach access token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = TOKEN_STORAGE.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and refresh token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retried and not the login/refresh endpoints themselves
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/api/auth/login/') &&
      !originalRequest.url?.includes('/api/auth/token/refresh/')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = TOKEN_STORAGE.getRefreshToken();
      if (!refreshToken) {
        TOKEN_STORAGE.clearTokens();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccess = response.data.access;
        // Some backends also return a rotated refresh token
        const newRefresh = response.data.refresh || refreshToken;
        TOKEN_STORAGE.setTokens(newAccess, newRefresh);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        }

        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr as AxiosError);
        TOKEN_STORAGE.clearTokens();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
