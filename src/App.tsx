import React from 'react';
import { Upload } from 'lucide-react';
import FileUploader from './components/FileUploader';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900">
      <div className="container mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Upload className="w-10 h-10 text-blue-400 animate-pulse" />
            <h1 className="text-4xl font-bold text-white">KeiranHost</h1>
          </div>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Share files anonymously and securely. No registration required.
            Your files are automatically deleted after 24 hours.
          </p>
        </header>

        <main>
          <FileUploader />
        </main>

        <footer className="mt-16 text-center text-gray-500 text-sm">
          <p>Files are limited to 100MB and are stored for 24 hours</p>
          <p className="mt-1">
            KeiranHost respects your privacy. No tracking, no cookies, no nonsense.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
