import React from 'react';
import type { WebRTCParticipant } from '../../../../types';

interface AvatarStackProps {
  participants: WebRTCParticipant[];
  maxVisible?: number;
}

const AvatarStack: React.FC<AvatarStackProps> = ({ participants, maxVisible = 5 }) => {
  if (!participants || participants.length === 0) {
    return null;
  }

  const visibleParticipants = participants.slice(0, maxVisible);
  const remainingCount = Math.max(0, participants.length - maxVisible);

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1">
      <div className="flex -space-x-2">
        {visibleParticipants.map((participant, index) => (
          <div
            key={participant.user_id}
            className="relative"
            style={{ zIndex: visibleParticipants.length - index }}
            title={participant.username || participant.display_name}
          >
            {participant.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.username || participant.display_name}
                className="h-6 w-6 rounded-full border-2 border-slate-950 bg-slate-800 object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 bg-emerald-600 text-[9px] font-semibold text-white">
                {getInitials(participant.username || participant.display_name)}
              </div>
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-700 text-[9px] font-semibold text-slate-300"
            title={`${remainingCount} more participant${remainingCount > 1 ? 's' : ''}`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
      <span className="ml-1 text-[10px] text-emerald-300/70">
        {participants.length} {participants.length === 1 ? 'user' : 'users'}
      </span>
    </div>
  );
};

export default AvatarStack;
