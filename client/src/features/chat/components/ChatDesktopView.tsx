import React from 'react';
import type { ChatController } from '../hooks/useChatController';
import AttachmentPreviewDialog from './chat-desktop/AttachmentPreviewDialog';
import ChannelSidebar from './chat-desktop/ChannelSidebar';
import ChatMainArea from './chat-desktop/ChatMainArea';
import CreateChannelDialog from './chat-desktop/CreateChannelDialog';
import ServerSidebar from './chat-desktop/ServerSidebar';

type ChatDesktopViewProps = {
  controller: ChatController;
};

const ChatDesktopView: React.FC<ChatDesktopViewProps> = ({ controller }) => {
  const {
    state: { isServerActionOpen, wsStatus },
    derived: { overlayCopy, spinnerStateClass, showConnectionOverlay },
    actions: { closeServerActionDialog, handleCreateServer, handleJoinServer, handleManualReconnect },
  } = controller;

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 surface-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/85" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen">
        <ServerSidebar controller={controller} />
        <ChannelSidebar controller={controller} />
        <ChatMainArea controller={controller} />
      </div>

      <CreateChannelDialog controller={controller} />
      <AttachmentPreviewDialog controller={controller} />

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
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/90 backdrop-blur">
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
