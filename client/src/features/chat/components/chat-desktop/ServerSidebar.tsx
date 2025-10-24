import React from 'react';
import type { ChatController } from '../../hooks/useChatController';

const ServerSidebar: React.FC<{ controller: ChatController }> = ({ controller }) => {
  const {
    state: { servers, selectedServer, isLoadingServers },
    actions: { handleServerSelect, openServerActionDialog },
  } = controller;

  return (
    <aside className="hidden w-16 flex-col items-center gap-3 border-r border-slate-800/70 bg-slate-950/80 px-2 py-6 md:flex">
      {isLoadingServers && <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-800/60" />}
      {servers.length === 0 && !isLoadingServers && (
        <p className="px-1 text-center text-[10px] uppercase tracking-[0.35em] text-slate-600">No servers</p>
      )}
      {servers.map((workspace) => {
        const isActive = selectedServer?.id === workspace.id;
        const initials = (workspace.name || '')
          .split(' ')
          .filter(Boolean)
          .map((word) => word[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || '??';

        return (
          <button
            key={workspace.id}
            type="button"
            onClick={() => handleServerSelect(workspace)}
            className={`group relative flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800/80 text-xs font-semibold text-white transition hover:scale-105 ${
              isActive ? 'border-primary-400/80 shadow-lg shadow-primary-500/30' : 'bg-slate-900/80'
            }`}
          >
            {workspace.icon ? (
              <img src={workspace.icon} alt={workspace.name} className="h-full w-full rounded-[10px] object-cover" />
            ) : (
              <span>{initials}</span>
            )}
            <span className="pointer-events-none absolute left-14 min-w-max origin-left scale-0 rounded-lg bg-slate-900/95 px-3 py-1 text-[11px] font-semibold text-slate-100 shadow-lg transition group-hover:scale-100">
              {workspace.name}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={openServerActionDialog}
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-slate-700/80 text-slate-500 transition hover:border-primary-400 hover:text-primary-200"
      >
        +
      </button>
    </aside>
  );
};

export default ServerSidebar;
