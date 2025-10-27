import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, avatarsAPI } from '../services/api';
import { User, AvatarCropData } from '../types';
import { AvatarEditor } from '../components/AvatarEditor';

export const UserSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await authAPI.getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        console.error('Failed to load user:', err);
        setError('Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const handleAvatarSave = async (file: File, cropData: AvatarCropData) => {
    try {
      // Upload directly to the API as multipart/form-data. Server will process and create thumbnails.
      const updatedUser = await avatarsAPI.uploadUserAvatar(file, cropData);
      setUser(updatedUser);
    } catch (err) {
      console.error('Failed to save avatar:', err);
      throw err;
    }
  };

  const handleAvatarDelete = async () => {
    try {
      const updatedUser = await avatarsAPI.deleteUserAvatar();
      setUser(updatedUser);
    } catch (err) {
      console.error('Failed to delete avatar:', err);
      throw err;
    }
  };

  const getInitials = (username: string) => {
    return username
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-400">{error || 'User not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-100">User Settings</h1>
          <button
            onClick={() => navigate('/chat')}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
          >
            Back to Chat
          </button>
        </div>

        {/* User Info Card */}
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-200">Profile Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-400">Username</p>
              <p className="text-lg font-medium text-slate-200">{user.username}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Email</p>
              <p className="text-lg font-medium text-slate-200">{user.email}</p>
            </div>
            {user.email_verified_at && (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400">
                  ✓ Email Verified
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Avatar Editor */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <AvatarEditor
            currentAvatarUrl={user.avatar}
            onSave={handleAvatarSave}
            onDelete={handleAvatarDelete}
            title="Profile Picture"
            initialLetters={getInitials(user.username)}
          />
        </div>
      </div>
    </div>
  );
};
