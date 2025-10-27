import React from 'react';
import type { WebRTCParticipant } from '../../../../types';
import { IconMic, IconMicOff } from './Icons';

interface AvatarStackProps {
  participants: WebRTCParticipant[];
}

const AvatarStack: React.FC<AvatarStackProps> = ({ participants }) => {
  if (!participants || participants.length === 0) {
    return null;
  }

  const getInitials = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) {
      return '?';
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  };

  const getDisplayName = (participant: WebRTCParticipant): string => {
    return participant.display_name || participant.username || 'Unknown User';
  };

  return (
    <div className="mt-1 space-y-1 px-3 pb-2">
      {participants.map((participant) => {
        const displayName = getDisplayName(participant);
        const micOn = participant.media_state?.mic === 'on';
        const participantKey = participant.session_id ?? `${participant.channel_id ?? 'channel'}-${participant.user_id}`;
        return (
          <div
            key={participantKey}
            className="flex items-center justify-between rounded-md bg-slate-900/60 px-2 py-1 text-sm text-slate-200"
          >
            <div className="flex min-w-0 items-center gap-2">
              {participant.avatar ? (
                <img
                  src={participant.avatar}
                  alt={displayName}
                  className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                  {getInitials(displayName)}
                </div>
              )}
              <span className="truncate">{displayName}</span>
            </div>
            <span className={`flex-shrink-0 ${micOn ? 'text-emerald-300' : 'text-slate-500'}`} aria-label={micOn ? 'Microphone on' : 'Microphone muted'}>
              {micOn ? <IconMic className="h-4 w-4" /> : <IconMicOff className="h-4 w-4" />}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default AvatarStack;
