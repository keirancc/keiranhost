import { create } from 'zustand';

export interface UploadFile {
  id?: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  shareLink?: string;
  error?: string;
}

interface UploadStore {
  files: UploadFile[];
  addFile: (file: UploadFile) => void;
  updateFile: (fileName: string, updates: Partial<UploadFile>) => void;
  removeFile: (fileName: string) => void;
}

export const useUploadStore = create<UploadStore>((set) => ({
  files: [],
  addFile: (file) =>
    set((state) => ({
      files: [...state.files, file],
    })),
  updateFile: (fileName, updates) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.name === fileName ? { ...file, ...updates } : file
      ),
    })),
  removeFile: (fileName) =>
    set((state) => ({
      files: state.files.filter((file) => file.name !== fileName),
    })),
}));