import React, { useState, useEffect } from 'react';
import { authAPI, avatarsAPI } from '../../../../services/api';
import { User, AvatarCropData } from '../../../../types';
import { AvatarEditor } from '../../../../components/AvatarEditor';

type UserSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({ isOpen, onClose }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadUser = async () => {
      try {
        setIsLoading(true);
        const currentUser = await authAPI.getCurrentUser();
        setUser(currentUser);
        setError(null);
      } catch (err) {
        console.error('Failed to load user:', err);
        setError('Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleAvatarSave = async (file: File, cropData: AvatarCropData) => {
    try {
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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/90 px-6 py-12 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800/80 bg-slate-900/95 p-6 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between sticky top-0 bg-slate-900/95 pb-4 z-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Account</p>
            <h2 className="mt-1 text-xl font-semibold text-white">User Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-400">Loading...</div>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-red-400">{error}</div>
          </div>
        )}

        {!isLoading && !error && user && (
          <div className="space-y-6">
            {/* User Info Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-200">Profile Information</h3>
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
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-6">
              <AvatarEditor
                currentAvatarUrl={user.avatar}
                onSave={handleAvatarSave}
                onDelete={handleAvatarDelete}
                title="Profile Picture"
                initialLetters={getInitials(user.username)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSettingsModal;
