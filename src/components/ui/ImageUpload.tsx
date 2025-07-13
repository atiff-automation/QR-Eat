'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';

interface ImageUploadProps {
  value?: string;
  onChange: (imageUrl: string | null) => void;
  className?: string;
  disabled?: boolean;
}

export function ImageUpload({ value, onChange, className = '', disabled = false }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setIsUploading(true);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image.');
      setIsUploading(false);
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB.');
      setIsUploading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        onChange(data.imageUrl);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFileDialog = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Upload Area */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
          ${value ? 'border-green-300 bg-green-50' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        {isUploading ? (
          <div className="space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-600">Uploading image...</p>
          </div>
        ) : value ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              <img
                src={value}
                alt="Uploaded"
                className="max-h-32 max-w-full object-contain rounded"
              />
            </div>
            <div className="flex justify-center space-x-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openFileDialog();
                }}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                disabled={disabled}
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-gray-400 text-4xl">📷</div>
            <div>
              <p className="text-gray-600 font-medium">
                {dragActive ? 'Drop image here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                JPEG, PNG, or WebP • Max 5MB • Recommended: 800x600px
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {/* Guidelines */}
      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
        <p className="font-medium mb-1">📏 Image Guidelines:</p>
        <ul className="space-y-1">
          <li>• <strong>Recommended size:</strong> 800x600px (4:3 ratio)</li>
          <li>• <strong>Minimum size:</strong> 400x300px</li>
          <li>• <strong>File formats:</strong> JPEG, PNG, WebP</li>
          <li>• <strong>Max file size:</strong> 5MB</li>
          <li>• <strong>Tips:</strong> Use good lighting, show the food clearly</li>
        </ul>
      </div>
    </div>
  );
}