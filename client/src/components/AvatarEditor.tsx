import React, { useState, useRef, useCallback } from 'react';
import { AvatarCropData } from '../types';

interface AvatarEditorProps {
  currentAvatarUrl?: string;
  onSave: (file: File, cropData: AvatarCropData) => Promise<void>;
  onDelete?: () => Promise<void>;
  title?: string;
  initialLetters?: string;
}

export const AvatarEditor: React.FC<AvatarEditorProps> = ({
  currentAvatarUrl,
  onSave,
  onDelete,
  title = 'Avatar',
  initialLetters = '?',
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropData, setCropData] = useState<AvatarCropData>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    scale: 1,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setError(null);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Reset crop data when new file is selected
    setCropData({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      scale: 1,
    });
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleSave = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      await onSave(selectedFile, cropData);
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsUploading(true);
    setError(null);

    try {
      await onDelete();
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete avatar');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-200">{title}</h3>

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-800/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-start gap-6">
        {/* Avatar Preview */}
        <div className="flex-shrink-0">
          <div className="relative h-32 w-32 rounded-full overflow-hidden bg-slate-800 border-2 border-slate-700">
            {displayUrl ? (
              <img src={displayUrl} alt="Avatar preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-4xl font-semibold text-slate-400">{initialLetters}</span>
              </div>
            )}
          </div>
        </div>

        {/* Upload Controls */}
        <div className="flex-1 space-y-4">
          {!selectedFile ? (
            <>
              <div
                className={`relative rounded-lg border-2 border-dashed p-8 text-center transition ${
                  isDragging
                    ? 'border-primary-400 bg-primary-900/10'
                    : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mb-2 text-sm font-medium text-primary-400 hover:text-primary-300"
                >
                  Click to upload
                </button>
                <p className="text-xs text-slate-400">or drag and drop</p>
                <p className="mt-2 text-xs text-slate-500">PNG, JPG, GIF up to 10MB</p>
              </div>

              {currentAvatarUrl && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isUploading}
                  className="w-full rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-900/30 disabled:opacity-50"
                >
                  {isUploading ? 'Removing...' : 'Remove Avatar'}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="text-sm text-slate-300">
                <p className="mb-1 font-medium">Selected: {selectedFile.name}</p>
                <p className="text-xs text-slate-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isUploading}
                  className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Save Avatar'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isUploading}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
