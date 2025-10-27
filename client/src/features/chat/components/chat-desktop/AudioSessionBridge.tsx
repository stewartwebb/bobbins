import React, { useMemo } from 'react';
import type { ChatController } from '../../hooks/useChatController';

const AudioSessionBridge: React.FC<{ controller: ChatController }> = ({ controller }) => {
  const {
    state: { webrtcState, remoteMediaStreams },
    refs: { remoteAudioElementsRef },
  } = controller;

  const shouldRenderPlayers = useMemo(() => {
    return Boolean(webrtcState && webrtcState.status === 'connected');
  }, [webrtcState]);

  const entries = useMemo(() => {
    if (!shouldRenderPlayers) {
      return [] as Array<[string, MediaStream]>;
    }

    return Object.entries(remoteMediaStreams);
  }, [remoteMediaStreams, shouldRenderPlayers]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
      aria-hidden="true"
    >
      {entries.map(([key]) => {
        const userId = Number(key);
        if (!Number.isFinite(userId)) {
          return null;
        }

        return (
          <audio
            key={userId}
            ref={(node) => {
              if (node) {
                remoteAudioElementsRef.current.set(userId, node);
                node.autoplay = true;
                node.muted = false;
                node.volume = 1;
                node.setAttribute('data-audio-participant', String(userId));
                node.setAttribute('playsinline', 'true');
                node.setAttribute('webkit-playsinline', 'true');
                node.controls = false;

                const stream = remoteMediaStreams[userId];
                if (stream && node.srcObject !== stream) {
                  node.srcObject = stream;
                }

                if (stream) {
                  const playPromise = node.play();
                  if (playPromise && typeof playPromise.catch === 'function') {
                    void playPromise.catch(() => undefined);
                  }
                }
                return;
              }

              const existing = remoteAudioElementsRef.current.get(userId);
              if (existing) {
                if (existing.srcObject) {
                  existing.srcObject = null;
                }
                remoteAudioElementsRef.current.delete(userId);
              }
            }}
            autoPlay
          />
        );
      })}
    </div>
  );
};

export default AudioSessionBridge;
