import React, { useEffect, useState } from 'react';
import type { ChatController } from '../hooks/useChatController';
import AttachmentPreviewDialog from './chat-desktop/AttachmentPreviewDialog';
import ChannelSidebar from './chat-desktop/ChannelSidebar';
import ChatMainArea from './chat-desktop/ChatMainArea';
import CreateChannelDialog from './chat-desktop/CreateChannelDialog';
import ServerSidebar from './chat-desktop/ServerSidebar';
import AudioSessionBridge from './chat-desktop/AudioSessionBridge';
import UserSettingsModal from './chat-desktop/UserSettingsModal';

type ChatDesktopViewProps = {
  controller: ChatController;
};

const ChatDesktopView: React.FC<ChatDesktopViewProps> = ({ controller }) => {
  const {
    state: {
      isServerActionOpen,
      wsStatus,
      servers,
      channels,
      selectedServer,
      selectedChannel,
      isLoadingServers,
      isLoadingChannels,
    },
    derived: { overlayCopy, spinnerStateClass, showConnectionOverlay, canManageChannels },
    actions: {
      closeServerActionDialog,
      handleCreateServer,
      handleJoinServer,
      handleManualReconnect,
      handleServerSelect,
      handleChannelSelect,
      handleOpenCreateChannel,
      openServerActionDialog,
    },
  } = controller;

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileNavOpen(false);
      }
    };

    if (mediaQuery.matches) {
      setIsMobileNavOpen(false);
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    const legacyListener = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileNavOpen(false);
      }
    };

    mediaQuery.addListener(legacyListener);
    return () => {
      mediaQuery.removeListener(legacyListener);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (isMobileNavOpen) {
      const { overflow } = document.body.style;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = overflow;
      };
    }

    return undefined;
  }, [isMobileNavOpen]);

  const closeMobileNav = () => setIsMobileNavOpen(false);

  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-slate-950 text-slate-100 surface-grid md:min-h-screen">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/85" aria-hidden="true" />
      <div className="relative z-10 flex min-h-dvh flex-1 flex-col overflow-hidden md:min-h-screen md:flex-row">
        <ServerSidebar controller={controller} />
        <ChannelSidebar controller={controller} onOpenUserSettings={() => setIsUserSettingsOpen(true)} />
        <div className="min-h-0 min-w-0 flex-1">
          <ChatMainArea controller={controller} onOpenNavigation={() => setIsMobileNavOpen(true)} />
        </div>
        <AudioSessionBridge controller={controller} />
      </div>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="relative flex h-full w-[82%] max-w-xs flex-col border-r border-slate-800/70 bg-slate-950/95 p-4 shadow-2xl shadow-slate-900/40"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Navigation</h2>
              <button
                type="button"
                onClick={closeMobileNav}
                className="rounded-lg border border-slate-800/70 px-3 py-1 text-xs text-slate-300 transition hover:border-primary-400 hover:text-primary-100"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto space-y-6 pr-1">
              <section>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Servers</span>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileNav();
                      openServerActionDialog();
                    }}
                    className="rounded-lg border border-dashed border-slate-800/60 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-slate-400 transition hover:border-primary-400 hover:text-primary-100"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {isLoadingServers && (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="h-12 animate-pulse rounded-xl border border-slate-900/70 bg-slate-900/60" />
                      ))}
                    </div>
                  )}
                  {!isLoadingServers && servers.length === 0 && (
                    <p className="text-[12px] text-slate-400">You are not a member of any servers yet.</p>
                  )}
                  {!isLoadingServers &&
                    servers.map((server) => {
                      const isActive = selectedServer?.id === server.id;
                      const initials = (server.name || '')
                        .split(' ')
                        .filter(Boolean)
                        .map((word) => word[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || '??';

                      return (
                        <button
                          key={server.id}
                          type="button"
                          onClick={() => {
                            handleServerSelect(server);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                            isActive
                              ? 'border-primary-400/70 bg-primary-500/10 text-primary-100'
                              : 'border-slate-800/80 bg-slate-950/80 text-slate-200 hover:border-primary-400/50 hover:text-primary-100'
                          }`}
                        >
                          <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-lg border border-slate-800/70 bg-slate-900 text-xs font-semibold uppercase text-primary-200">
                            {server.icon ? (
                              <img src={server.icon} alt={server.name} className="h-full w-full object-cover" />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col">
                            <span className="font-semibold">{server.name}</span>
                            {isActive && (
                              <span className="text-[11px] uppercase tracking-[0.3em] text-primary-200/80">Selected</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Channels</span>
                  {canManageChannels && selectedServer && (
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileNav();
                        handleOpenCreateChannel();
                      }}
                      className="rounded-lg border border-dashed border-slate-800/60 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-slate-400 transition hover:border-primary-400 hover:text-primary-100"
                    >
                      New
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {!selectedServer && (
                    <p className="text-[12px] text-slate-400">Select a server to view its channels.</p>
                  )}
                  {selectedServer && isLoadingChannels && (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-12 animate-pulse rounded-xl border border-slate-900/70 bg-slate-900/60" />
                      ))}
                    </div>
                  )}
                  {selectedServer && !isLoadingChannels && channels.length === 0 && (
                    <p className="text-[12px] text-slate-400">No channels yet for this server.</p>
                  )}
                  {selectedServer && !isLoadingChannels &&
                    channels.map((channel) => {
                      const isActive = selectedChannel?.id === channel.id;
                      const isAudioChannel = channel.type === 'audio';
                      const prefix = isAudioChannel ? '🎧' : '#';

                      return (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => {
                            handleChannelSelect(channel);
                            closeMobileNav();
                          }}
                          className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-3 text-left transition ${
                            isActive
                              ? 'border-primary-400/70 bg-primary-500/10 text-primary-100'
                              : 'border-slate-800/80 bg-slate-950/80 text-slate-200 hover:border-primary-400/50 hover:text-primary-100'
                          }`}
                        >
                          <span className="flex items-center gap-2 font-mono text-sm">
                            <span className={isAudioChannel ? 'text-emerald-300' : 'text-primary-300'}>{prefix}</span>
                            {channel.name}
                          </span>
                          {channel.description && (
                            <span className="text-[11px] text-slate-400">{channel.description}</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </section>
            </div>
          </div>
          <div
            className="flex-1 bg-slate-950/70 backdrop-blur-sm"
            onClick={closeMobileNav}
            aria-hidden="true"
          />
        </div>
      )}

      <CreateChannelDialog controller={controller} />
      <AttachmentPreviewDialog controller={controller} />
      <UserSettingsModal isOpen={isUserSettingsOpen} onClose={() => setIsUserSettingsOpen(false)} />

      {isServerActionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-800/80 bg-slate-950/95 p-6 shadow-2xl shadow-slate-900/40">
            <button
              type="button"
              onClick={closeServerActionDialog}
              className="absolute right-4 top-4 text-sm text-slate-400 transition hover:text-slate-200"
            >
              esc
            </button>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Add workspace</p>
              <h2 className="text-lg font-semibold text-white">How would you like to continue?</h2>
              <p className="text-sm text-slate-400">
                Join an existing community or spin up a brand new space for your team.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleJoinServer}
                className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-primary-400/60 hover:text-primary-100"
              >
                <span className="font-semibold">Join an existing server</span>
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">soon</span>
              </button>
              <button
                type="button"
                onClick={handleCreateServer}
                className="flex items-center justify-between rounded-xl bg-primary-400/90 px-4 py-3 text-left text-sm font-semibold text-slate-950 shadow-md shadow-primary-500/30 transition hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200/80"
              >
                <span>Create a new server</span>
                <span className="font-mono text-xs">↵</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showConnectionOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-800/80 bg-slate-950/95 p-6 text-center shadow-2xl shadow-slate-900/40">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary-400/80 ${spinnerStateClass}`}
              />
            </div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Realtime status</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{overlayCopy.title}</h2>
            <p className="mt-3 text-sm text-slate-300">{overlayCopy.body}</p>
            {wsStatus === 'error' && (
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleManualReconnect}
                  className="rounded-xl bg-primary-400/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-primary-500/20 transition hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200/80"
                >
                  Retry now
                </button>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Auto-retrying every 10s</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatDesktopView;
