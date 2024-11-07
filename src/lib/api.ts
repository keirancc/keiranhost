import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { backOff } from 'exponential-backoff';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const MAX_RETRIES = 3;

// Types
export interface UploadChunkResponse {
  chunkId: string;
  success: boolean;
}

export interface CompleteUploadResponse {
  fileId: string;
  shareLink: string;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

// API client configuration
export const api = axios.create({
  baseURL: API_URL,
  timeout: 50000,
  // CORS configuration
  withCredentials: true, // Include credentials if you're using cookies/authentication
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
});

// Request interceptor for adding CORS headers
api.interceptors.request.use((config) => {
  config.headers['Access-Control-Allow-Origin'] = '*';
  config.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
  config.headers['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept, Authorization';
  return config;
});

// Response interceptor for handling errors
api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // Add token refresh logic here if needed
      return api(originalRequest);
    }
    
    return Promise.reject(handleApiError(error));
  }
);

// Error handling
const handleApiError = (error: AxiosError): ApiError => {
  const apiError: ApiError = new Error(
    error.response?.data?.detail || error.message || 'An unknown error occurred'
  );
  apiError.status = error.response?.status;
  apiError.code = error.code;
  return apiError;
};

// Utility functions
export const getFullShareUrl = (path: string): string => {
  return `${API_URL}${path}`;
};

// Retry wrapper
const withRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  return backOff(() => operation(), {
    numOfAttempts: MAX_RETRIES,
    startingDelay: 1000,
    timeMultiple: 2,
    jitter: 'full'
  });
};

// API functions
export const uploadChunk = async (
  chunk: Blob,
  fileName: string,
  chunkIndex: number,
  totalChunks: number,
  onProgress?: (progress: number) => void
): Promise<UploadChunkResponse> => {
  const formData = new FormData();
  const chunkFile = new File([chunk], `${fileName}.part${chunkIndex}`);
  
  formData.append('chunk', chunkFile);
  formData.append('fileName', fileName);
  formData.append('chunkIndex', chunkIndex.toString());
  formData.append('totalChunks', totalChunks.toString());

  return withRetry(async () => {
    try {
      const { data } = await api.post<UploadChunkResponse>('/upload/chunk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        },
      });
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw handleApiError(error);
      }
      throw error;
    }
  });
};

export const completeUpload = async (
  fileName: string,
  totalChunks: number
): Promise<CompleteUploadResponse> => {
  return withRetry(async () => {
    try {
      const { data } = await api.post<CompleteUploadResponse>('/upload/complete', {
        fileName,
        totalChunks,
      });
      return {
        ...data,
        shareLink: getFullShareUrl(data.shareLink),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw handleApiError(error);
      }
      throw error;
    }
  });
};
