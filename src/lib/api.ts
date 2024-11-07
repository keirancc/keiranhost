import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 50000,
});

export interface UploadChunkResponse {
  chunkId: string;
  success: boolean;
}

export interface CompleteUploadResponse {
  fileId: string;
  shareLink: string;
}

export const getFullShareUrl = (path: string): string => {
  return `${API_URL}${path}`;
};

export const uploadChunk = async (
  chunk: Blob,
  fileName: string,
  chunkIndex: number,
  totalChunks: number
): Promise<UploadChunkResponse> => {
  const formData = new FormData();
  formData.append('chunk', new File([chunk], `${fileName}.part${chunkIndex}`));
  formData.append('fileName', fileName);
  formData.append('chunkIndex', chunkIndex.toString());
  formData.append('totalChunks', totalChunks.toString());

  try {
    const { data } = await api.post<UploadChunkResponse>('/upload/chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.detail || 'Failed to upload chunk');
    }
    throw error;
  }
};

export const completeUpload = async (
  fileName: string,
  totalChunks: number
): Promise<CompleteUploadResponse> => {
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
      throw new Error(error.response?.data?.detail || 'Failed to complete upload');
    }
    throw error;
  }
};
