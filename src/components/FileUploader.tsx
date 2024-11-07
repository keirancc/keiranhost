import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, AlertCircle } from 'lucide-react';
import { createFileChunks } from '../lib/fileChunker';
import { uploadChunk, completeUpload } from '../lib/api';
import { useUploadStore } from '../stores/uploadStore';
import UploadProgress from './UploadProgress';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export default function FileUploader() {
  const { addFile, updateFile } = useUploadStore();

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      addFile({
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'error',
        error: 'File size exceeds 100MB limit',
      });
      return;
    }

    const chunks = createFileChunks(file);
    const totalChunks = chunks.length;

    addFile({
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    });

    try {
      for (let i = 0; i < chunks.length; i++) {
        try {
          await uploadChunk(chunks[i], file.name, i, totalChunks);
          const progress = Math.round(((i + 1) / totalChunks) * 100);
          updateFile(file.name, { progress });
        } catch (error) {
          throw new Error(`Failed to upload chunk ${i + 1} of ${totalChunks}`);
        }
      }

      const { shareLink } = await completeUpload(file.name, totalChunks);
      updateFile(file.name, {
        status: 'completed',
        progress: 100,
        shareLink,
      });
    } catch (error) {
      updateFile(file.name, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed. Please try again.',
      });
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach(handleFileUpload);
    },
    [addFile]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
          isDragReject
            ? 'border-red-500 bg-red-500/10'
            : isDragActive
            ? 'border-blue-400 bg-blue-400/10 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
            : 'border-gray-700 hover:border-blue-400 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]'
        }`}
      >
        <input {...getInputProps()} />
        {isDragReject ? (
          <>
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-semibold mb-2 text-red-400">File too large</h3>
            <p className="text-red-400">
              Maximum file size is 100MB
            </p>
          </>
        ) : (
          <>
            <Upload className={`w-16 h-16 mx-auto mb-4 ${
              isDragActive ? 'text-blue-400 animate-pulse' : 'text-blue-500'
            }`} />
            <h3 className="text-xl font-semibold mb-2 text-white">Drop your files here</h3>
            <p className="text-gray-400">
              or click to select files (maximum 100MB per file)
            </p>
          </>
        )}
      </div>

      <UploadProgress />
    </div>
  );
}
