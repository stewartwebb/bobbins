import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatController } from '../../hooks/useChatController';
import { IconMic, IconMicOff, IconPhone, IconVideo, IconVideoOff } from './Icons';
import AvatarStack from './AvatarStack';

const ChannelSidebar: React.FC<{ controller: ChatController }> = ({ controller }) => {
  const {
    state: {
      selectedServer,
      channels,
      selectedChannel,
      isLoadingChannels,
      currentUser,
      localMediaState,
      webrtcState,
      channelParticipants,
    },
    derived: {
      canManageChannels,
      audioIndicatorClasses,
      audioStatusBadgeClass,
      webrtcStatusLabel,
      audioSessionInfoText,
      audioControlsDisabled,
    },
    actions: {
      handleChannelSelect,
      handleOpenCreateChannel,
      handleToggleMic,
      handleToggleCamera,
      handleLeaveAudioChannel,
    },
  } = controller;

  const navigate = useNavigate();

  const getUserInitials = () => {
    if (!currentUser?.username) return '??';
    return currentUser.username
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-slate-800/70 bg-slate-950/75 px-4 py-6 md:flex md:flex-col">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Workspace</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{selectedServer?.name ?? 'Workspace'}</h2>
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              bafa@chat://{selectedChannel?.name ?? 'welcome'}
            </p>
          </div>
          {selectedServer && selectedServer.current_member_role === 'owner' && (
            <button
              type="button"
              onClick={() => navigate(`/servers/${selectedServer.id}/settings`)}
              className="mt-2 rounded-lg border border-slate-800/70 bg-slate-900/50 px-2 py-1 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-300"
              title="Server Settings"
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      <nav className="flex-1 space-y-1">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">channels</p>
        {isLoadingChannels && (
          <div className="space-y-2 px-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-900/60" />
            ))}
          </div>
        )}
        {!isLoadingChannels && channels.length === 0 && (
          <p className="px-2 text-[11px] text-slate-500">
            {canManageChannels
              ? 'No channels yet. Use "Add Channel" to get started.'
              : 'No channels yet. Check back once the server owner creates one.'}
          </p>
        )}
        {!isLoadingChannels &&
          channels.map((channel) => {
            const isActive = selectedChannel?.id === channel.id;
            const isAudioChannel = channel.type === 'audio';
            const prefix = isAudioChannel ? '🎧' : '#';
            const isLiveAudio =
              isAudioChannel &&
              webrtcState &&
              webrtcState.channelId === channel.id &&
              webrtcState.status === 'connected';
            const participants = isAudioChannel ? (channelParticipants[channel.id] || []) : [];
            const hasParticipants = participants.length > 0;

            return (
              <div key={channel.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleChannelSelect(channel)}
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition ${
                    isActive
                      ? 'border border-slate-700 bg-slate-900 text-primary-100 shadow-md shadow-slate-900/40'
                      : 'text-slate-300 hover:bg-slate-900/70 hover:text-primary-100'
                  }`}
                >
                  <span className="flex items-center gap-2 font-mono text-sm">
                    <span className={isAudioChannel ? 'text-emerald-300' : 'text-primary-300'}>{prefix}</span>
                    {channel.name}
                  </span>
                  {channel.description && (
                    <span className="text-[11px] text-slate-500">{channel.description}</span>
                  )}
                  {isAudioChannel && (
                    <span
                      className={`text-[10px] uppercase tracking-[0.3em] ${
                        isLiveAudio ? 'text-emerald-300' : 'text-emerald-300/70'
                      }`}
                    >
                      {isLiveAudio ? 'live' : 'audio'}
                    </span>
                  )}
                </button>
                {hasParticipants && <AvatarStack participants={participants} maxVisible={5} />}
              </div>
            );
          })}
        {!isLoadingChannels && canManageChannels && selectedServer && (
          <div className="mt-5 space-y-3 px-2">
            <div className="h-px bg-slate-800/60" />
            <button
              type="button"
              onClick={handleOpenCreateChannel}
              className="flex w-full flex-col gap-1 rounded-lg border border-dashed border-slate-800/60 bg-slate-950/60 px-3 py-3 text-left text-slate-400 transition hover:border-primary-400/60 hover:bg-slate-900/70 hover:text-primary-100"
            >
              <span className="flex items-center gap-3 text-sm font-medium text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-base text-slate-400">
                  +
                </span>
                Create a channel
              </span>
              <span className="text-[11px] text-slate-500">Organize conversations by adding text or audio rooms.</span>
            </button>
          </div>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-4 pt-6">
        <div className="rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-3 text-[11px] text-slate-400">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">debug info</p>
          <dl className="space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Auth user</dt>
              <dd className="truncate text-slate-200">
                {currentUser ? `${currentUser.username} (#${currentUser.id})` : 'unknown'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Server role</dt>
              <dd className="truncate text-slate-200">
                {selectedServer ? selectedServer.current_member_role ?? 'unknown' : 'n/a'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Can manage</dt>
              <dd className="truncate text-slate-200">{canManageChannels ? 'yes' : 'no'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Server owner</dt>
              <dd className="truncate text-slate-200">
                {selectedServer ? `#${selectedServer.owner_id}` : 'n/a'}
              </dd>
            </div>
          </dl>
        </div>

        {webrtcState && (
          <div className={`rounded-2xl border px-4 py-4 text-sm transition ${audioIndicatorClasses}`}>
            <div className="flex items-start justify-between gap-3">
              <span className={`rounded-full px-3 py-[2px] text-[10px] font-semibold uppercase tracking-[0.3em] ${audioStatusBadgeClass}`}>
                {webrtcStatusLabel}
              </span>
            </div>

            <p className={`mt-2 text-[11px] ${webrtcState.status === 'connected' ? 'text-emerald-100/80' : 'text-slate-300/80'}`}>
              {audioSessionInfoText}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleToggleMic();
                }}
                disabled={audioControlsDisabled}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                  localMediaState.mic === 'on'
                    ? 'border-emerald-400 bg-emerald-400/20 text-emerald-50'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-label={localMediaState.mic === 'on' ? 'Mute microphone' : 'Unmute microphone'}
              >
                {localMediaState.mic === 'on' ? <IconMic className="h-4 w-4" /> : <IconMicOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleToggleCamera();
                }}
                disabled={audioControlsDisabled}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                  localMediaState.camera === 'on'
                    ? 'border-emerald-400 bg-emerald-400/20 text-emerald-50'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-label={localMediaState.camera === 'on' ? 'Disable camera' : 'Enable camera'}
              >
                {localMediaState.camera === 'on' ? <IconVideo className="h-4 w-4" /> : <IconVideoOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleLeaveAudioChannel();
                }}
                disabled={audioControlsDisabled}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-red-500/80 px-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-red-400/80 disabled:cursor-not-allowed disabled:bg-red-500/40"
                aria-label="Leave audio session"
              >
                <IconPhone className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Profile Section */}
      <div className="mt-4 border-t border-slate-800/70 pt-4">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2 transition hover:border-slate-700 hover:bg-slate-900/70"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800 text-xs font-semibold text-primary-200">
            {currentUser?.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.username} className="h-full w-full object-cover" />
            ) : (
              <span>{getUserInitials()}</span>
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-slate-200">{currentUser?.username ?? 'User'}</p>
            <p className="text-xs text-slate-500">Settings</p>
          </div>
        </button>
      </div>
    </aside>
  );
};

export default ChannelSidebar;
