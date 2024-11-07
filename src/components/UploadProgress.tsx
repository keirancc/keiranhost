import React from 'react';
import { File, Link, CheckCircle2, XCircle } from 'lucide-react';
import { useUploadStore } from '../stores/uploadStore';

export default function UploadProgress() {
  const files = useUploadStore((state) => state.files);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCopyLink = async (shareLink: string) => {
    try {
      await navigator.clipboard.writeText(shareLink);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleDownload = (shareLink: string, fileName: string) => {
    window.open(shareLink, '_blank');
  };

  if (files.length === 0) return null;

  return (
    <div className="mt-8">
      <h4 className="text-lg font-semibold mb-4 text-white">Files</h4>
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.name}
            className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <File className="text-blue-400" />
                <div>
                  <p className="font-medium text-white">{file.name}</p>
                  <p className="text-sm text-gray-400">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                {file.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="text-green-400" />
                    {file.shareLink && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleCopyLink(file.shareLink!)}
                          className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 px-2 py-1 rounded-md hover:bg-blue-500/10 transition-colors duration-200"
                        >
                          <Link className="w-4 h-4" />
                          <span className="text-sm">Copy Link</span>
                        </button>
                        <button
                          onClick={() => handleDownload(file.shareLink!, file.name)}
                          className="text-sm text-blue-400 hover:text-blue-300 px-2 py-1 rounded-md hover:bg-blue-500/10 transition-colors duration-200"
                        >
                          Download
                        </button>
                      </div>
                    )}
                  </>
                ) : file.status === 'error' ? (
                  <div className="flex items-center space-x-2 text-red-400">
                    <XCircle />
                    <span className="text-sm">{file.error}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300 relative"
                        style={{ width: `${file.progress}%` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-400 animate-pulse" />
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">
                      {file.progress}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
