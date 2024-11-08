import axios, { AxiosError, AxiosRequestConfig } from 'axios';

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

export const api = axios.create({
  baseURL: API_URL,
  timeout: 50000,
  headers: {
    'Accept': 'application/json',
  }
});

api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    if (error.response?.status === 0 || error.code === 'ERR_NETWORK') {
      throw new Error('Network error - Please check your connection');
    }
    
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      return api(originalRequest);
    }
    
    return Promise.reject(handleApiError(error));
  }
);

const handleApiError = (error: AxiosError): ApiError => {
  const apiError: ApiError = new Error(
    error.response?.data?.detail || error.message || 'An unknown error occurred'
  );
  apiError.status = error.response?.status;
  apiError.code = error.code;
  return apiError;
};

export const getFullShareUrl = (path: string): string => {
  return `${API_URL}${path}`;
};

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

  let retries = 0;
  const maxRetries = MAX_RETRIES;

  while (retries < maxRetries) {
    try {
      const { data } = await api.post<UploadChunkResponse>('/upload/chunk', formData, {
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        },
      });
      return data;
    } catch (error) {
      retries++;
      if (retries === maxRetries || !(error instanceof Error)) {
        throw error;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }

  throw new Error('Maximum retries exceeded');
};

export const completeUpload = async (
  fileName: string,
  totalChunks: number
): Promise<CompleteUploadResponse> => {
  let retries = 0;
  const maxRetries = MAX_RETRIES;

  while (retries < maxRetries) {
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
      retries++;
      if (retries === maxRetries || !(error instanceof Error)) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }

  throw new Error('Maximum retries exceeded');
};

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    await api.get('/health');
    return true;
  } catch {
    return false;
  }
};
