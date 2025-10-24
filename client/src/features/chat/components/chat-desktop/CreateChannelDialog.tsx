import React from 'react';
import type { ChatController } from '../../hooks/useChatController';

const CreateChannelDialog: React.FC<{ controller: ChatController }> = ({ controller }) => {
  const {
    state: {
      isCreateChannelOpen,
      isCreatingChannel,
      createChannelError,
      createChannelForm,
      selectedServer,
    },
    derived: { canManageChannels },
    actions: {
      handleCloseCreateChannel,
      handleCreateChannelSubmit,
      handleCreateChannelNameChange,
      handleCreateChannelDescriptionChange,
      handleCreateChannelTypeChange,
    },
  } = controller;

  if (!isCreateChannelOpen || !canManageChannels || !selectedServer) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/90 px-6 py-12 backdrop-blur"
      onClick={handleCloseCreateChannel}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-900/95 p-6 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">New channel</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Add a channel</h2>
            <p className="mt-1 text-sm text-slate-400">
              Create a new space for your team to chat or hang out in {selectedServer.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseCreateChannel}
            className="rounded-full bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Close create channel dialog"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleCreateChannelSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="create-channel-name" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Channel name
            </label>
            <input
              id="create-channel-name"
              type="text"
              value={createChannelForm.name}
              onChange={handleCreateChannelNameChange}
              placeholder="general"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              autoFocus
              disabled={isCreatingChannel}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="create-channel-description" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Description <span className="text-slate-500/60 normal-case">(optional)</span>
            </label>
            <textarea
              id="create-channel-description"
              value={createChannelForm.description}
              onChange={handleCreateChannelDescriptionChange}
              placeholder="A quick summary of what this channel is for"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              rows={3}
              disabled={isCreatingChannel}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="create-channel-type" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Channel type
            </label>
            <select
              id="create-channel-type"
              value={createChannelForm.type}
              onChange={handleCreateChannelTypeChange}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              disabled={isCreatingChannel}
            >
              <option value="text">Text channel</option>
              <option value="audio">Audio channel</option>
            </select>
          </div>

          {createChannelError && <p className="text-sm text-red-400">{createChannelError}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseCreateChannel}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              disabled={isCreatingChannel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
              disabled={isCreatingChannel}
            >
              {isCreatingChannel ? 'Creating…' : 'Create channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateChannelDialog;
