import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { serversAPI, avatarsAPI } from '../services/api';
import { Server, AvatarCropData } from '../types';
import { AvatarEditor } from '../components/AvatarEditor';

export const ServerSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();
  const [server, setServer] = useState<Server | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadServer = async () => {
      if (!serverId) {
        setError('Server ID not provided');
        setIsLoading(false);
        return;
      }

      try {
        const serverData = await serversAPI.getServer(parseInt(serverId, 10));
        setServer(serverData);
      } catch (err) {
        console.error('Failed to load server:', err);
        setError('Failed to load server data');
      } finally {
        setIsLoading(false);
      }
    };

    loadServer();
  }, [serverId]);

  const handleAvatarSave = async (file: File, cropData: AvatarCropData) => {
    if (!server) return;

    try {
      // Step 1: Get presigned upload URL
      const presignResponse = await avatarsAPI.presignServerAvatarUpload(server.id, {
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
      });

      // Step 2: Upload file to object storage
      await avatarsAPI.uploadFile(presignResponse.upload_url, file, presignResponse.headers);

      // Step 3: Set avatar with crop data
      const updatedServer = await avatarsAPI.setServerAvatar(server.id, {
        object_key: presignResponse.object_key,
        url: presignResponse.file_url,
        crop_data: cropData,
      });

      setServer(updatedServer);
    } catch (err) {
      console.error('Failed to save server avatar:', err);
      throw new Error('Failed to save server avatar. Please try again.');
    }
  };

  const handleAvatarDelete = async () => {
    if (!server) return;

    try {
      const updatedServer = await avatarsAPI.deleteServerAvatar(server.id);
      setServer(updatedServer);
    } catch (err) {
      console.error('Failed to delete server avatar:', err);
      throw new Error('Failed to delete server avatar. Please try again.');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??';
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-red-400">{error || 'Server not found'}</div>
        <button
          onClick={() => navigate('/chat')}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
        >
          Back to Chat
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-100">Server Settings</h1>
          <button
            onClick={() => navigate('/chat')}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
          >
            Back to Chat
          </button>
        </div>

        {/* Server Info Card */}
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-200">Server Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-400">Server Name</p>
              <p className="text-lg font-medium text-slate-200">{server.name}</p>
            </div>
            {server.description && (
              <div>
                <p className="text-sm text-slate-400">Description</p>
                <p className="text-lg font-medium text-slate-200">{server.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-slate-400">Owner</p>
              <p className="text-lg font-medium text-slate-200">
                {server.owner?.username || `User #${server.owner_id}`}
              </p>
            </div>
          </div>
        </div>

        {/* Avatar Editor */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <AvatarEditor
            currentAvatarUrl={server.icon || undefined}
            onSave={handleAvatarSave}
            onDelete={handleAvatarDelete}
            title="Server Avatar"
            initialLetters={getInitials(server.name)}
          />
        </div>
      </div>
    </div>
  );
};
