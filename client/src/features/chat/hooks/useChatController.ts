import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { authAPI, buildWebSocketURL, channelsAPI, serversAPI, uploadsAPI } from '../../../services/api';
import { notificationSounds } from '../../../services/notificationSounds';
import type {
  Channel,
  Message,
  MessageAttachment,
  Server,
  User,
  WebRTCParticipant,
  WebRTCMediaState,
} from '../../../types';

type WebSocketEnvelope = {
  type: string;
  data?: {
    message?: Message;
    channel_id?: number;
    server_id?: number;
    channel?: Channel;
    user?: Partial<User> | null;
    expires_at?: string;
    active?: boolean;
    code?: string;
    reason?: string;
    participant?: WebRTCParticipant;
    participants?: WebRTCParticipant[];
    media_state?: WebRTCMediaState;
    [key: string]: unknown;
  };
};

export type ChatController = ReturnType<typeof useChatController>;

type UploadStatus = 'uploading' | 'success' | 'error';

type UploadTracker = {
  id: string;
  name: string;
  status: UploadStatus;
  error?: string;
};

type TypingEntry = {
  id: number;
  name: string;
  expiresAt: number;
};

type WebRTCSessionStatus = 'authenticating' | 'connected' | 'error';

type WebRTCSessionState = {
  channelId: number;
  sessionToken: string;
  expiresAt: string;
  participant: WebRTCParticipant;
  participants: WebRTCParticipant[];
  iceservers: unknown;
  sfu: unknown;
  status: WebRTCSessionStatus;
  error?: string;
};

const DEFAULT_MEDIA_STATE: WebRTCMediaState = {
  mic: 'off',
  camera: 'off',
  screen: 'off',
};

type UseChatControllerOptions = {
  navigate?: (path: string) => void;
};


const MESSAGE_PAGE_SIZE = 50;
const TYPING_THROTTLE_MS = 2500;
const TYPING_PRUNE_INTERVAL_MS = 4000;
const TYPING_EVENT_FALLBACK_MS = 7500;

const mergeMediaState = (
  base?: WebRTCMediaState | null,
  incoming?: WebRTCMediaState | null
): WebRTCMediaState => ({
  mic: incoming?.mic ?? base?.mic ?? DEFAULT_MEDIA_STATE.mic,
  camera: incoming?.camera ?? base?.camera ?? DEFAULT_MEDIA_STATE.camera,
  screen: incoming?.screen ?? base?.screen ?? DEFAULT_MEDIA_STATE.screen,
});

const normalizeParticipantRoster = (roster: WebRTCParticipant[]): WebRTCParticipant[] => {
  const byId = new Map<number, WebRTCParticipant>();

  roster.forEach((participant) => {
    if (typeof participant.user_id !== 'number') {
      return;
    }

    const existing = byId.get(participant.user_id);
    const displayName =
      typeof participant.display_name === 'string' && participant.display_name.trim().length > 0
        ? participant.display_name
        : existing?.display_name ?? `Member #${participant.user_id}`;

    const merged: WebRTCParticipant = {
      ...existing,
      ...participant,
      display_name: displayName,
      media_state: mergeMediaState(existing?.media_state, participant.media_state),
    };

    byId.set(participant.user_id, merged);
  });

  return Array.from(byId.values()).sort((a, b) => {
    const nameA = (a.display_name || '').toLowerCase();
    const nameB = (b.display_name || '').toLowerCase();
    const comparison = nameA.localeCompare(nameB);
    if (comparison !== 0) {
      return comparison;
    }
    return a.user_id - b.user_id;
  });
};

const upsertParticipant = (participants: WebRTCParticipant[], next: WebRTCParticipant): WebRTCParticipant[] => {
  const filtered = participants.filter((entry) => entry.user_id !== next.user_id);
  return normalizeParticipantRoster([...filtered, next]);
};

const removeParticipantById = (participants: WebRTCParticipant[], userId: number): WebRTCParticipant[] =>
  participants.filter((entry) => entry.user_id !== userId);

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const extractIceServers = (source: unknown): RTCIceServer[] | undefined => {
  if (!source) {
    return undefined;
  }

  if (Array.isArray(source)) {
    return source as RTCIceServer[];
  }

  if (typeof source === 'object') {
    const maybe = source as { iceServers?: unknown };
    if (Array.isArray(maybe.iceServers)) {
      return maybe.iceServers as RTCIceServer[];
    }
  }

  return undefined;
};

export const useChatController = (options: UseChatControllerOptions = {}) => {
  const navigate = options.navigate;

  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [messageInput, setMessageInput] = useState('');
  const [isServerActionOpen, setIsServerActionOpen] = useState(false);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [error, setError] = useState('');
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [wsRetryCount, setWsRetryCount] = useState(0);
  const [uploadQueue, setUploadQueue] = useState<UploadTracker[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [composerMaxHeight, setComposerMaxHeight] = useState(240);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [typingByChannel, setTypingByChannel] = useState<Record<number, TypingEntry[]>>({});
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [createChannelError, setCreateChannelError] = useState('');
  const [createChannelForm, setCreateChannelForm] = useState<{ name: string; description: string; type: 'text' | 'audio' }>(
    {
      name: '',
      description: '',
      type: 'text',
    }
  );
  const [webrtcState, setWebrtcState] = useState<WebRTCSessionState | null>(null);
  const [isJoiningWebRTC, setIsJoiningWebRTC] = useState(false);
  const [webrtcError, setWebrtcError] = useState<string | null>(null);
  const [localMediaState, setLocalMediaState] = useState<WebRTCMediaState>(DEFAULT_MEDIA_STATE);
  const [remoteMediaStreams, setRemoteMediaStreams] = useState<Record<number, MediaStream>>({});
  const [mediaPermissionError, setMediaPermissionError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedServerIdRef = useRef<number | null>(null);
  const selectedChannelIdRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageListContentRef = useRef<HTMLDivElement | null>(null);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipDirectUploadRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const isPrependingRef = useRef(false);
  const forceScrollToBottomRef = useRef(true);
  const currentUserIdRef = useRef<number | null>(null);
  const typingCleanupTimerRef = useRef<number | null>(null);
  const typingCooldownRef = useRef(0);
  const isTypingRef = useRef(false);
  const lastTypingChannelRef = useRef<number | null>(null);
  const previousChannelIdRef = useRef<number | null>(null);
  const webrtcSessionRef = useRef<WebRTCSessionState | null>(null);
  const pendingWebRTCAuthRef = useRef<{ sessionToken: string; channelId: number } | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<number, MediaStream>>(new Map());
  const pendingCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const remoteMediaElementsRef = useRef<Map<number, HTMLVideoElement>>(new Map());
  const makingOfferRef = useRef<Map<number, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<number, boolean>>(new Map());
  const settingRemoteAnswerRef = useRef<Map<number, boolean>>(new Map());
  const localPreviewRef = useRef<HTMLVideoElement | null>(null);
  const localMediaStateRef = useRef<WebRTCMediaState>(DEFAULT_MEDIA_STATE);
  const remoteAudioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const selfLeaveSoundPlayedRef = useRef(false);

  const normalizeChannelList = useCallback(
    (list: Channel[]) =>
      [...list].sort((a, b) => {
        if (a.position !== b.position) {
          return a.position - b.position;
        }
        return a.name.localeCompare(b.name);
      }),
    []
  );

  const canManageChannels = useMemo(() => {
    if (!selectedServer || !currentUser) {
      return false;
    }
    if (selectedServer.current_member_role) {
      return selectedServer.current_member_role === 'owner';
    }
    return selectedServer.owner_id === currentUser.id;
  }, [selectedServer, currentUser]);

  useEffect(() => {
    selectedServerIdRef.current = selectedServer?.id ?? null;
  }, [selectedServer?.id]);

  useEffect(() => {
    localMediaStateRef.current = localMediaState;
  }, [localMediaState]);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null;
  }, [selectedChannel?.id]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser?.id]);

  useEffect(() => {
    if (!canManageChannels && isCreateChannelOpen) {
      setIsCreateChannelOpen(false);
    }
  }, [canManageChannels, isCreateChannelOpen]);

  useEffect(() => {
    const previousId = previousChannelIdRef.current;
    const nextId = selectedChannel?.id ?? null;

    if (previousId && previousId !== nextId && lastTypingChannelRef.current === previousId) {
      channelsAPI
        .sendTypingIndicator(previousId, false)
        .catch((error) => {
          console.debug('Failed to send typing stop signal during channel switch', error);
        });
      lastTypingChannelRef.current = null;
    }

    isTypingRef.current = false;
    typingCooldownRef.current = 0;
    previousChannelIdRef.current = nextId;
  }, [selectedChannel?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        if (isMounted) {
          setCurrentUser(user);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const status =
          typeof error === 'object' &&
          error !== null &&
          'response' in error &&
          (error as { response?: { status?: number } }).response?.status;

        if (status === 401) {
          localStorage.removeItem('authToken');
          if (navigate) {
            navigate('/login');
          }
          return;
        }

        console.warn('Failed to load current user', error);
      }
    };

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      return;
    }

    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      setWsRetryCount((count) => count + 1);
    }, 10_000);
  }, []);

  const setAutoScrollOnNextRender = useCallback((force = false): boolean => {
    if (force) {
      forceScrollToBottomRef.current = true;
      return true;
    }

    const container = messageListRef.current;
    if (!container) {
      forceScrollToBottomRef.current = true;
      return true;
    }

    const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
    const shouldScroll = distanceFromBottom <= 160;
    forceScrollToBottomRef.current = shouldScroll;
    return shouldScroll;
  }, []);

  const ensurePinnedToBottom = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
    if (forceScrollToBottomRef.current || distanceFromBottom <= 160) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: forceScrollToBottomRef.current ? 'smooth' : 'auto',
      });
      forceScrollToBottomRef.current = false;
    }
  }, []);

  const pruneTypingIndicators = useCallback(() => {
    setTypingByChannel((previous) => {
      const now = Date.now();
      let mutated = false;
      const next: Record<number, TypingEntry[]> = {};

      for (const [key, entries] of Object.entries(previous)) {
        const filtered = entries.filter((entry) => entry.expiresAt > now);
        if (filtered.length !== entries.length) {
          mutated = true;
        }

        if (filtered.length > 0) {
          if (filtered.length === entries.length) {
            next[Number(key)] = entries;
          } else {
            next[Number(key)] = filtered;
          }
        }
      }

      if (!mutated && Object.keys(previous).length === Object.keys(next).length) {
        return previous;
      }

      return next;
    });
  }, []);

  const sendWebSocketMessage = useCallback(
    (payload: unknown): boolean => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      try {
        socket.send(JSON.stringify(payload));
        return true;
      } catch (error) {
        console.debug('Failed to send websocket payload', error);
        return false;
      }
    },
    []
  );

  const authenticateWebRTCSession = useCallback(
    (session: WebRTCSessionState) => {
      pendingWebRTCAuthRef.current = {
        sessionToken: session.sessionToken,
        channelId: session.channelId,
      };

      const sent = sendWebSocketMessage({
        type: 'session.authenticate',
        data: {
          session_token: session.sessionToken,
          channel_id: session.channelId,
        },
      });

      if (sent) {
        pendingWebRTCAuthRef.current = null;
      }
    },
    [sendWebSocketMessage]
  );

  const updateWebRTCState = useCallback(
    (updater: (previous: WebRTCSessionState | null) => WebRTCSessionState | null) => {
      setWebrtcState((previous) => {
        const next = updater(previous);
        webrtcSessionRef.current = next;
        return next;
      });
    },
    []
  );

  const teardownWebRTCSession = useCallback(() => {
    peerConnectionsRef.current.forEach((connection) => {
      try {
        connection.onicecandidate = null;
        connection.ontrack = null;
        connection.onnegotiationneeded = null;
        connection.onconnectionstatechange = null;
        connection.getSenders().forEach((sender) => {
          try {
            connection.removeTrack(sender);
          } catch (removeError) {
            console.debug('Failed to remove track during teardown', removeError);
          }
        });
        connection.close();
      } catch (closeError) {
        console.debug('Peer connection teardown error', closeError);
      }
    });

    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    remoteStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    remoteStreamsRef.current.clear();

    remoteMediaElementsRef.current.forEach((element) => {
      element.srcObject = null;
    });
    remoteMediaElementsRef.current.clear();

    remoteAudioElementsRef.current.forEach((element) => {
      try {
        element.srcObject = null;
      } catch (audioDetachError) {
        console.debug('Remote audio teardown error', audioDetachError);
      }
    });
    remoteAudioElementsRef.current.clear();

    setRemoteMediaStreams({});

    const localStream = localMediaStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localMediaStreamRef.current = null;
    }

    if (localPreviewRef.current) {
      localPreviewRef.current.srcObject = null;
    }

    setLocalMediaState(DEFAULT_MEDIA_STATE);
    setMediaPermissionError(null);
  }, []);

  const updateLocalMediaState = useCallback(
    (patch: Partial<WebRTCMediaState>, options: { broadcast?: boolean } = {}) => {
      setLocalMediaState((previous) => {
        const base = mergeMediaState(DEFAULT_MEDIA_STATE, previous);
        const next: WebRTCMediaState = {
          mic: patch.mic ?? base.mic,
          camera: patch.camera ?? base.camera,
          screen: patch.screen ?? base.screen,
        };

        if (next.mic === base.mic && next.camera === base.camera && next.screen === base.screen) {
          return previous;
        }

        if (options.broadcast !== false) {
          sendWebSocketMessage({
            type: 'participant.update',
            data: {
              media_state: next,
            },
          });

          updateWebRTCState((session) => {
            if (!session) {
              return session;
            }

            const nextParticipant: WebRTCParticipant = {
              ...session.participant,
              media_state: mergeMediaState(session.participant.media_state, next),
            };

            const updatedParticipants = session.participants.map((entry) =>
              entry.user_id === nextParticipant.user_id
                ? { ...entry, media_state: mergeMediaState(entry.media_state, next) }
                : entry
            );

            return {
              ...session,
              participant: nextParticipant,
              participants: updatedParticipants,
            };
          });
        }

        return next;
      });
    },
    [sendWebSocketMessage, updateWebRTCState]
  );

  const ensureLocalMedia = useCallback(
    async (options: { video?: boolean } = {}): Promise<MediaStream | null> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setMediaPermissionError('Media capture is not supported in this browser.');
        return null;
      }

      const wantsVideo = Boolean(options.video);
      let stream = localMediaStreamRef.current;

      try {
        if (!stream) {
          const constraints: MediaStreamConstraints = {
            audio: true,
            video: wantsVideo
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : false,
          };

          stream = await navigator.mediaDevices.getUserMedia(constraints);
          localMediaStreamRef.current = stream;
          setMediaPermissionError(null);

          stream.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });

          stream.getVideoTracks().forEach((track) => {
            track.enabled = wantsVideo;
            track.onended = () => {
              updateLocalMediaState({ camera: 'off' }, { broadcast: true });
            };
          });
        } else if (wantsVideo && stream.getVideoTracks().length === 0) {
          const additionalStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });

          const [videoTrack] = additionalStream.getVideoTracks();
          additionalStream.getTracks().forEach((track) => {
            if (track !== videoTrack) {
              track.stop();
            }
          });

          if (videoTrack) {
            videoTrack.enabled = true;
            videoTrack.onended = () => {
              updateLocalMediaState({ camera: 'off' }, { broadcast: true });
            };
            stream.addTrack(videoTrack);

            peerConnectionsRef.current.forEach((connection) => {
              const alreadySending = connection
                .getSenders()
                .some((sender) => sender.track?.kind === videoTrack.kind);
              if (!alreadySending) {
                connection.addTrack(videoTrack, stream as MediaStream);
              }
            });
          }
        }

        const previewElement = localPreviewRef.current;
        if (previewElement && stream && previewElement.srcObject !== stream) {
          previewElement.srcObject = stream;
          previewElement.muted = true;
          previewElement.playsInline = true;
        }

        return stream ?? null;
      } catch (captureError) {
        console.warn('Failed to access media devices', captureError);
        if (!stream) {
          setMediaPermissionError('Microphone or camera access was denied. Update permissions to join with audio.');
        } else if (wantsVideo) {
          setMediaPermissionError('We could not enable your camera. Please verify browser permissions.');
        }
        return null;
      }
    },
    [updateLocalMediaState]
  );

  const closePeerConnection = useCallback(
    (userId: number) => {
      const connection = peerConnectionsRef.current.get(userId);
      if (!connection) {
        return;
      }

      peerConnectionsRef.current.delete(userId);
      pendingCandidatesRef.current.delete(userId);
      makingOfferRef.current.delete(userId);
      ignoreOfferRef.current.delete(userId);
      settingRemoteAnswerRef.current.delete(userId);

      try {
        connection.onicecandidate = null;
        connection.ontrack = null;
        connection.onnegotiationneeded = null;
        connection.onconnectionstatechange = null;
        connection.getSenders().forEach((sender) => {
          try {
            connection.removeTrack(sender);
          } catch (removeError) {
            console.debug('removeTrack failed during close', removeError);
          }
        });
        connection.close();
      } catch (connectionError) {
        console.debug('Error closing peer connection', connectionError);
      }

      const remoteStream = remoteStreamsRef.current.get(userId);
      if (remoteStream) {
        remoteStream.getTracks().forEach((track) => track.stop());
        remoteStreamsRef.current.delete(userId);
      }

      setRemoteMediaStreams((previous) => {
        if (!(userId in previous)) {
          return previous;
        }
        const { [userId]: _, ...rest } = previous;
        return rest;
      });

      const mediaElement = remoteMediaElementsRef.current.get(userId);
      if (mediaElement) {
        mediaElement.srcObject = null;
        remoteMediaElementsRef.current.delete(userId);
      }
    },
    []
  );

  const drainPendingIceCandidates = useCallback(async (userId: number, connection: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(userId);
    if (!pending || pending.length === 0) {
      return;
    }

    pendingCandidatesRef.current.delete(userId);

    for (const candidate of pending) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        console.warn('Failed to add queued ICE candidate', candidateError);
      }
    }
  }, []);

  const getOrCreatePeerConnection = useCallback(
    async (targetUserId: number): Promise<RTCPeerConnection | null> => {
      const session = webrtcSessionRef.current;
      if (!session || session.status !== 'connected') {
        return null;
      }

      const existing = peerConnectionsRef.current.get(targetUserId);
      if (existing) {
        return existing;
      }

      const configuration: RTCConfiguration = {};
      const iceServers = extractIceServers(session.iceservers);
      if (iceServers) {
        configuration.iceServers = iceServers;
      }

      const connection = new RTCPeerConnection(configuration);

      connection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        const candidate = event.candidate.toJSON();
        sendWebSocketMessage({
          type: 'webrtc.ice_candidate',
          data: {
            target_user_id: targetUserId,
            candidate: candidate.candidate,
            sdp_mid: candidate.sdpMid,
            sdp_mline_index: candidate.sdpMLineIndex,
          },
        });
      };

      connection.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) {
          return;
        }

        remoteStreamsRef.current.set(targetUserId, stream);
        setRemoteMediaStreams((previous) => {
          if (previous[targetUserId] === stream) {
            return previous;
          }
          return { ...previous, [targetUserId]: stream };
        });
      };

      connection.onconnectionstatechange = () => {
        const state = connection.connectionState;
        if (state === 'failed' || state === 'closed') {
          closePeerConnection(targetUserId);
        }
      };

      connection.onnegotiationneeded = async () => {
        if (makingOfferRef.current.get(targetUserId)) {
          return;
        }

        makingOfferRef.current.set(targetUserId, true);

        try {
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          sendWebSocketMessage({
            type: 'webrtc.offer',
            data: {
              target_user_id: targetUserId,
              sdp: offer.sdp,
              type: offer.type,
            },
          });
        } catch (offerError) {
          console.warn('Failed to negotiate WebRTC offer', offerError);
        } finally {
          makingOfferRef.current.set(targetUserId, false);
        }
      };

      peerConnectionsRef.current.set(targetUserId, connection);
  makingOfferRef.current.set(targetUserId, false);
  ignoreOfferRef.current.set(targetUserId, false);
  settingRemoteAnswerRef.current.set(targetUserId, false);

      const wantsVideo = localMediaStateRef.current.camera === 'on';
      const localStream = await ensureLocalMedia({ video: wantsVideo });
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          const alreadySending = connection.getSenders().some((sender) => sender.track === track);
          if (!alreadySending) {
            connection.addTrack(track, localStream);
          }
        });
      }

      return connection;
    },
    [closePeerConnection, ensureLocalMedia, sendWebSocketMessage]
  );

  const handleIncomingOffer = useCallback(
    async (data: Record<string, unknown>) => {
      const fromUserId = parseNumericId(data.from_user_id);
      const sdp = typeof data.sdp === 'string' ? data.sdp : null;
      const type = typeof data.type === 'string' ? (data.type as RTCSdpType) : 'offer';

      if (!fromUserId || !sdp) {
        return;
      }

      const connection = await getOrCreatePeerConnection(fromUserId);
      if (!connection) {
        return;
      }

      const currentUserId = currentUserIdRef.current;
      const polite = !currentUserId || currentUserId > fromUserId;
      const makingOffer = makingOfferRef.current.get(fromUserId) ?? false;
      const settingAnswer = settingRemoteAnswerRef.current.get(fromUserId) ?? false;
      const offerCollision = connection.signalingState !== 'stable' || makingOffer || settingAnswer;
      const shouldIgnore = !polite && offerCollision;

      ignoreOfferRef.current.set(fromUserId, shouldIgnore);
      if (shouldIgnore) {
        return;
      }

      if (offerCollision) {
        try {
          await connection.setLocalDescription({ type: 'rollback' });
        } catch (rollbackError) {
          console.warn('Failed to rollback local description', rollbackError);
        }
      }

      try {
        await connection.setRemoteDescription({ type, sdp });
      } catch (descriptionError) {
        console.warn('Failed to apply remote offer', descriptionError);
        return;
      }

      await drainPendingIceCandidates(fromUserId, connection);

      try {
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        sendWebSocketMessage({
          type: 'webrtc.answer',
          data: {
            target_user_id: fromUserId,
            sdp: answer.sdp,
            type: answer.type,
          },
        });
      } catch (answerError) {
        console.warn('Failed to create WebRTC answer', answerError);
      }
    },
    [drainPendingIceCandidates, getOrCreatePeerConnection, sendWebSocketMessage]
  );

  const handleIncomingAnswer = useCallback(
    async (data: Record<string, unknown>) => {
      const fromUserId = parseNumericId(data.from_user_id);
      const sdp = typeof data.sdp === 'string' ? data.sdp : null;
      const type = typeof data.type === 'string' ? (data.type as RTCSdpType) : 'answer';

      if (!fromUserId || !sdp) {
        return;
      }

      const connection = peerConnectionsRef.current.get(fromUserId);
      if (!connection) {
        return;
      }

      settingRemoteAnswerRef.current.set(fromUserId, true);

      try {
        await connection.setRemoteDescription({ type, sdp });
        await drainPendingIceCandidates(fromUserId, connection);
      } catch (answerError) {
        console.warn('Failed to apply remote answer', answerError);
      } finally {
        settingRemoteAnswerRef.current.set(fromUserId, false);
      }
    },
    [drainPendingIceCandidates]
  );

  const handleIncomingCandidate = useCallback(
    async (data: Record<string, unknown>) => {
      const fromUserId = parseNumericId(data.from_user_id);
      const candidateValue = typeof data.candidate === 'string' ? data.candidate : null;
      if (!fromUserId || !candidateValue) {
        return;
      }

      const candidate: RTCIceCandidateInit = {
        candidate: candidateValue,
      };

      if (typeof data.sdp_mid === 'string') {
        candidate.sdpMid = data.sdp_mid;
      } else if (typeof data.sdpMid === 'string') {
        candidate.sdpMid = data.sdpMid;
      }

      if (typeof data.sdp_mline_index === 'number') {
        candidate.sdpMLineIndex = data.sdp_mline_index;
      } else if (typeof data.sdpMLineIndex === 'number') {
        candidate.sdpMLineIndex = data.sdpMLineIndex;
      } else if (typeof data.sdp_mline_index === 'string') {
        const parsed = Number(data.sdp_mline_index);
        if (Number.isFinite(parsed)) {
          candidate.sdpMLineIndex = parsed;
        }
      }

      const connection = peerConnectionsRef.current.get(fromUserId);
      if (!connection || !connection.remoteDescription) {
        const queued = pendingCandidatesRef.current.get(fromUserId) ?? [];
        queued.push(candidate);
        pendingCandidatesRef.current.set(fromUserId, queued);
        return;
      }

      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        console.warn('Failed to apply ICE candidate', candidateError);
      }
    },
    []
  );

  const handleToggleMic = useCallback(async () => {
    const session = webrtcSessionRef.current;
    if (!session || session.status !== 'connected') {
      setMediaPermissionError('Join the audio channel before toggling your microphone.');
      return;
    }

    const wantsVideo = localMediaStateRef.current.camera === 'on';
    const stream = await ensureLocalMedia({ video: wantsVideo });
    if (!stream) {
      return;
    }

    const nextMicState: 'on' | 'off' = localMediaStateRef.current.mic === 'on' ? 'off' : 'on';
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextMicState === 'on';
    });

    setMediaPermissionError(null);
    updateLocalMediaState({ mic: nextMicState }, { broadcast: true });
    
    // Play mute/unmute notification sound
    notificationSounds.play(nextMicState === 'on' ? 'unmute' : 'mute');
  }, [ensureLocalMedia, updateLocalMediaState]);

  const handleToggleCamera = useCallback(async () => {
    const session = webrtcSessionRef.current;
    if (!session || session.status !== 'connected') {
      setMediaPermissionError('Join the audio channel before toggling your camera.');
      return;
    }

    const enabling = localMediaStateRef.current.camera !== 'on';
    const stream = await ensureLocalMedia({ video: enabling });
    if (!stream) {
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (enabling && videoTracks.length === 0) {
      setMediaPermissionError('No camera was detected. Check your device permissions.');
      return;
    }

    videoTracks.forEach((track) => {
      track.enabled = enabling;
    });

    if (enabling) {
      setMediaPermissionError(null);
    }

    updateLocalMediaState({ camera: enabling ? 'on' : 'off' }, { broadcast: true });
  }, [ensureLocalMedia, updateLocalMediaState]);

  const handleLeaveAudioChannel = useCallback(async () => {
    const session = webrtcSessionRef.current;
    if (!session) {
      updateWebRTCState(() => null);
      setWebrtcError(null);
      setIsJoiningWebRTC(false);
      teardownWebRTCSession();
      if (!selfLeaveSoundPlayedRef.current) {
        try {
          notificationSounds.play('leave_channel');
        } catch (playError) {
          console.debug('Failed to play leave sound', playError);
        }
        selfLeaveSoundPlayedRef.current = true;
      }
      return;
    }

    pendingWebRTCAuthRef.current = null;
    updateWebRTCState(() => null);
    setWebrtcError(null);
    setIsJoiningWebRTC(false);
    teardownWebRTCSession();

    if (!selfLeaveSoundPlayedRef.current) {
      try {
        notificationSounds.play('leave_channel');
      } catch (playError) {
        console.debug('Failed to play leave sound', playError);
      }
      selfLeaveSoundPlayedRef.current = true;
    }

    sendWebSocketMessage({
      type: 'session.leave',
      data: {
        channel_id: session.channelId,
      },
    });

    try {
      await channelsAPI.leaveWebRTC(session.channelId, session.sessionToken);
    } catch (leaveError) {
      console.debug('Failed to terminate WebRTC session cleanly', leaveError);
    }
  }, [sendWebSocketMessage, teardownWebRTCSession, updateWebRTCState]);

  const handleJoinAudioChannel = useCallback(async () => {
    if (!selectedChannel || selectedChannel.type !== 'audio' || isJoiningWebRTC) {
      return;
    }

    const existingSession = webrtcSessionRef.current;
    if (existingSession) {
      const sameChannel = existingSession.channelId === selectedChannel.id;
      const sessionHealthy = sameChannel && existingSession.status !== 'error';

      if (sessionHealthy) {
        return;
      }

      await handleLeaveAudioChannel();
    }

    teardownWebRTCSession();
    setIsJoiningWebRTC(true);
    setWebrtcError(null);

    try {
      const response = await channelsAPI.joinWebRTC(selectedChannel.id);
      const roster = normalizeParticipantRoster([
        response.participant,
        ...(response.participants ?? []),
      ]);

      const others = roster.filter((entry) => entry.user_id !== response.participant.user_id);

      const session: WebRTCSessionState = {
        channelId: selectedChannel.id,
        sessionToken: response.session_token,
        expiresAt: response.expires_at,
        participant: response.participant,
        participants: others,
        iceservers: response.iceservers,
        sfu: response.sfu,
        status: 'authenticating',
      };

      updateWebRTCState(() => session);

      authenticateWebRTCSession(session);
    } catch (joinError) {
      const apiMessage =
        typeof joinError === 'object' &&
        joinError !== null &&
        'response' in joinError &&
        (joinError as { response?: { data?: { error?: string } } }).response?.data?.error;

      const fallback = 'We couldn’t connect you to this audio channel. Please try again.';
      setWebrtcError(typeof apiMessage === 'string' && apiMessage.trim().length > 0 ? apiMessage : fallback);
      updateWebRTCState(() => null);
    } finally {
      setIsJoiningWebRTC(false);
    }
  }, [authenticateWebRTCSession, handleLeaveAudioChannel, isJoiningWebRTC, selectedChannel, teardownWebRTCSession, updateWebRTCState]);

  useEffect(() => () => {
    void handleLeaveAudioChannel();
  }, [handleLeaveAudioChannel]);

  useEffect(() => {
    if (!selectedChannel || selectedChannel.type !== 'audio') {
      return;
    }

    void handleJoinAudioChannel();
  }, [handleJoinAudioChannel, selectedChannel]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    typingCleanupTimerRef.current = window.setInterval(() => {
      pruneTypingIndicators();
    }, TYPING_PRUNE_INTERVAL_MS);

    return () => {
      if (typingCleanupTimerRef.current !== null) {
        window.clearInterval(typingCleanupTimerRef.current);
        typingCleanupTimerRef.current = null;
      }
    };
  }, [pruneTypingIndicators]);

  const startTyping = useCallback(() => {
    if (!selectedChannel || selectedChannel.type !== 'text') {
      return;
    }

    const channelId = selectedChannel.id;
    const now = Date.now();
    if (now - typingCooldownRef.current < TYPING_THROTTLE_MS && lastTypingChannelRef.current === channelId) {
      return;
    }

    typingCooldownRef.current = now;
    isTypingRef.current = true;
    lastTypingChannelRef.current = channelId;

    channelsAPI
      .sendTypingIndicator(channelId, true)
      .catch((error) => {
        console.debug('Failed to send typing indicator', error);
      });
  }, [selectedChannel]);

  const stopTyping = useCallback(
    (channelOverride?: number) => {
      const fallbackChannelId = lastTypingChannelRef.current ?? selectedChannel?.id ?? null;
      const channelId = channelOverride ?? fallbackChannelId;

      if (!channelId) {
        return;
      }

      if (!channelOverride && !isTypingRef.current && lastTypingChannelRef.current === null) {
        return;
      }

      channelsAPI
        .sendTypingIndicator(channelId, false)
        .catch((error) => {
          console.debug('Failed to send typing stop indicator', error);
        });

      if (!channelOverride || channelId === selectedChannel?.id) {
        isTypingRef.current = false;
      }

      if (!channelOverride || channelId === lastTypingChannelRef.current) {
        lastTypingChannelRef.current = null;
      }

      typingCooldownRef.current = 0;
    },
    [selectedChannel]
  );

  useEffect(
    () => () => {
      const channelId = lastTypingChannelRef.current;
      if (!channelId) {
        return;
      }

      channelsAPI
        .sendTypingIndicator(channelId, false)
        .catch((error) => {
          console.debug('Failed to send typing stop signal during cleanup', error);
        });
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateMaxHeight = () => {
      const viewportHeight = window.innerHeight || 720;
      const next = Math.max(120, Math.floor(viewportHeight / 3));
      setComposerMaxHeight(next);
    };

    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);

    return () => {
      window.removeEventListener('resize', updateMaxHeight);
    };
  }, []);

  useEffect(() => {
    const textarea = messageInputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const measured = Math.min(textarea.scrollHeight, composerMaxHeight);
    const nextHeight = Math.max(measured, 44);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > composerMaxHeight ? 'auto' : 'hidden';
  }, [messageInput, composerMaxHeight]);

  useEffect(() => {
    let isMounted = true;

    const fetchServers = async () => {
      try {
        setIsLoadingServers(true);
        const data = await serversAPI.getServers();
        if (!isMounted) {
          return;
        }
        const fetchedServers = data?.servers ?? [];
        setServers(fetchedServers);
        if (fetchedServers.length > 0) {
          setSelectedServer((current) => current ?? fetchedServers[0]);
        }
      } catch (err) {
        if (isMounted) {
          setServers([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingServers(false);
        }
      }
    };

    fetchServers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedServer) {
      setChannels([]);
      setSelectedChannel(null);
      return;
    }

    let isMounted = true;

    const fetchChannels = async () => {
      try {
        setIsLoadingChannels(true);
        const fetched = await channelsAPI.getChannels(selectedServer.id);
        if (!isMounted) {
          return;
        }
        const sorted = normalizeChannelList(fetched ?? []);
        setChannels(sorted);

        if (sorted.length === 0) {
          setSelectedChannel(null);
          return;
        }

        setSelectedChannel((current) => {
          if (current && sorted.some((channel) => channel.id === current.id)) {
            return current;
          }
          const firstTextChannel = sorted.find((channel) => channel.type === 'text');
          return firstTextChannel ?? sorted[0];
        });
      } catch (err) {
        if (isMounted) {
          setChannels([]);
          setSelectedChannel(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingChannels(false);
        }
      }
    };

    fetchChannels();

    return () => {
      isMounted = false;
    };
  }, [normalizeChannelList, selectedServer]);

  useEffect(() => {
    if (!selectedChannel || selectedChannel.type !== 'text') {
      setMessages([]);
      setHasMoreMessages(false);
      setMessagesCursor(null);
      setIsLoadingOlderMessages(false);
      forceScrollToBottomRef.current = true;
      isPrependingRef.current = false;
      setUnreadMessageCount(0);
      return;
    }

    let isMounted = true;

    const fetchMessages = async () => {
      try {
        setIsLoadingMessages(true);
        const result = await channelsAPI.getMessages(selectedChannel.id, {
          limit: MESSAGE_PAGE_SIZE,
        });
        if (!isMounted) {
          return;
        }

        const fetchedMessages = result?.messages ?? [];
        const nextCursor = result?.next_cursor ?? (fetchedMessages[0]?.created_at ?? null);

        setHasMoreMessages(result?.has_more ?? false);
        setMessagesCursor(nextCursor);
        const willScroll = setAutoScrollOnNextRender(true);
        if (willScroll) {
          setUnreadMessageCount(0);
        }
        setMessages(fetchedMessages);
      } catch (err) {
        if (isMounted) {
          setMessages([]);
          setHasMoreMessages(false);
          setMessagesCursor(null);
          setUnreadMessageCount(0);
        }
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
          setIsLoadingOlderMessages(false);
        }
      }
    };

    fetchMessages();

    return () => {
      isMounted = false;
    };
  }, [selectedChannel, setAutoScrollOnNextRender]);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setWsStatus('error');
      return;
    }

    let manualClose = false;
    setWsStatus((status) => (status === 'connected' ? status : 'connecting'));

    try {
      const socket = new WebSocket(buildWebSocketURL(token));
      wsRef.current = socket;

      const handleMessage = (event: MessageEvent) => {
        try {
          const payload: WebSocketEnvelope = JSON.parse(event.data);
          if (!payload || !payload.type) {
            return;
          }

          if (payload.type === 'session.ready') {
            const rawChannelId = payload.data?.channel_id;
            const channelId =
              typeof rawChannelId === 'number'
                ? rawChannelId
                : typeof rawChannelId === 'string'
                  ? Number(rawChannelId)
                  : Number.NaN;

            if (!Number.isFinite(channelId)) {
              return;
            }

            pendingWebRTCAuthRef.current = null;

            setWebrtcState((previous) => {
              if (!previous || previous.channelId !== channelId) {
                return previous;
              }

              const next: WebRTCSessionState = {
                ...previous,
                status: 'connected',
                error: undefined,
              };
              webrtcSessionRef.current = next;
              selfLeaveSoundPlayedRef.current = false;
              // Play a join sound when we successfully connect our own audio session
              try {
                notificationSounds.play('join_channel');
              } catch (playError) {
                console.debug('Failed to play join sound', playError);
              }
              return next;
            });

            return;
          }

          if (payload.type === 'session.error') {
            const messageField = payload.data?.message as unknown;
            const codeField = payload.data?.code as unknown;
            const description =
              typeof messageField === 'string' && messageField.trim().length > 0
                ? messageField
                : typeof codeField === 'string' && codeField.trim().length > 0
                  ? `Session error: ${codeField}`
                  : 'Your audio session encountered an issue.';

            pendingWebRTCAuthRef.current = null;
            webrtcSessionRef.current = null;
            teardownWebRTCSession();
            setWebrtcState(null);
            setWebrtcError(description);
            return;
          }

          if (payload.type === 'participant.joined' || payload.type === 'participant.updated') {
            const data = (payload.data ?? {}) as Record<string, unknown>;
            const rawChannelId = data.channel_id;
            const rawUserId = data.user_id;

            const channelId =
              typeof rawChannelId === 'number'
                ? rawChannelId
                : typeof rawChannelId === 'string'
                  ? Number(rawChannelId)
                  : Number.NaN;
            const userId =
              typeof rawUserId === 'number'
                ? rawUserId
                : typeof rawUserId === 'string'
                  ? Number(rawUserId)
                  : Number.NaN;

            if (!Number.isFinite(channelId) || !Number.isFinite(userId)) {
              return;
            }

            setWebrtcState((previous) => {
              if (!previous || previous.channelId !== channelId) {
                return previous;
              }

              const baseParticipant =
                previous.participant.user_id === userId
                  ? previous.participant
                  : previous.participants.find((participant) => participant.user_id === userId);

              const incomingMedia =
                typeof data.media_state === 'object' && data.media_state !== null
                  ? (data.media_state as WebRTCMediaState)
                  : undefined;

              const participant: WebRTCParticipant = {
                ...baseParticipant,
                user_id: userId,
                channel_id: channelId,
                display_name:
                  typeof data.display_name === 'string' && data.display_name.trim().length > 0
                    ? (data.display_name as string)
                    : baseParticipant?.display_name ?? `Member #${userId}`,
                role: typeof data.role === 'string' ? (data.role as string) : baseParticipant?.role,
                session_id: typeof data.session_id === 'string' ? (data.session_id as string) : baseParticipant?.session_id,
                media_state: mergeMediaState(baseParticipant?.media_state, incomingMedia),
                last_seen: typeof data.last_seen === 'string' ? (data.last_seen as string) : baseParticipant?.last_seen,
              };

              const nextParticipants = upsertParticipant(previous.participants, participant);
              const isSelf = previous.participant.user_id === userId;
              const nextSelf = isSelf ? { ...previous.participant, ...participant } : previous.participant;

              const next: WebRTCSessionState = {
                ...previous,
                participant: nextSelf,
                participants: nextParticipants,
              };

              webrtcSessionRef.current = next;
              return next;
            });

            const selfId = currentUserIdRef.current;
            if (selfId && selfId !== userId) {
              void getOrCreatePeerConnection(userId);
              
              // Play join sound only when someone else joins (not on updates)
              if (payload.type === 'participant.joined') {
                notificationSounds.play('join_channel');
              }
            }
            return;
          }

          if (payload.type === 'participant.left') {
            const data = (payload.data ?? {}) as Record<string, unknown>;
            const rawChannelId = data.channel_id;
            const rawUserId = data.user_id;

            const channelId =
              typeof rawChannelId === 'number'
                ? rawChannelId
                : typeof rawChannelId === 'string'
                  ? Number(rawChannelId)
                  : Number.NaN;
            const userId =
              typeof rawUserId === 'number'
                ? rawUserId
                : typeof rawUserId === 'string'
                  ? Number(rawUserId)
                  : Number.NaN;

            if (!Number.isFinite(channelId) || !Number.isFinite(userId)) {
              return;
            }

            let removedSelf = false;

            setWebrtcState((previous) => {
              if (!previous || previous.channelId !== channelId) {
                return previous;
              }

              if (previous.participant.user_id === userId) {
                removedSelf = true;
                return null;
              }

              const nextParticipants = removeParticipantById(previous.participants, userId);
              const next: WebRTCSessionState = {
                ...previous,
                participants: nextParticipants,
              };
              webrtcSessionRef.current = next;
              return next;
            });

            closePeerConnection(userId);

            if (removedSelf) {
              pendingWebRTCAuthRef.current = null;
              webrtcSessionRef.current = null;
              teardownWebRTCSession();
              if (!selfLeaveSoundPlayedRef.current) {
                // Play leave sound when the server kicks us (e.g., disconnect) and we haven't already played locally
                try {
                  notificationSounds.play('leave_channel');
                } catch (playError) {
                  console.debug('Failed to play leave sound', playError);
                }
              }
              selfLeaveSoundPlayedRef.current = false;
              setWebrtcError((current) => current ?? 'You left the audio channel.');
            } else {
              // Play leave sound when someone else leaves
              const selfId = currentUserIdRef.current;
              if (selfId && selfId !== userId) {
                notificationSounds.play('leave_channel');
              }
            }
            return;
          }

          if (payload.type === 'message.created') {
            const channelId = payload.data?.channel_id;
            const message = payload.data?.message;

            if (typeof channelId !== 'number' || !message) {
              return;
            }

            setTypingByChannel((previous) => {
              const existing = previous[channelId];
              if (!existing || existing.length === 0) {
                return previous;
              }

              const filtered = existing.filter((entry) => entry.id !== message.user_id);
              if (filtered.length === existing.length) {
                return previous;
              }

              const next = { ...previous };
              if (filtered.length > 0) {
                next[channelId] = filtered;
              } else {
                delete next[channelId];
              }
              return next;
            });

            if (selectedChannelIdRef.current !== channelId) {
              return;
            }

            const willScroll = setAutoScrollOnNextRender();
            let inserted = false;
            setMessages((previous) => {
              if (previous.some((existing) => existing.id === message.id)) {
                return previous;
              }
              inserted = true;
              return [...previous, message];
            });

            if (inserted) {
              setMessagesCursor((current) => current ?? message.created_at);
              if (willScroll) {
                setUnreadMessageCount(0);
              } else {
                setUnreadMessageCount((count) => count + 1);
              }
              
              // Play notification sound for messages from other users
              const currentUserId = currentUserIdRef.current;
              if (currentUserId && message.user_id !== currentUserId) {
                notificationSounds.play('message');
              }
            }

            return;
          }

          if (payload.type === 'channel.typing') {
            const channelId = payload.data?.channel_id;
            const user = payload.data?.user;

            if (typeof channelId !== 'number' || !user) {
              return;
            }

            const typingUserId = user.id;
            if (typeof typingUserId !== 'number') {
              return;
            }

            const currentUserId = currentUserIdRef.current;
            if (currentUserId && typingUserId === currentUserId) {
              return;
            }

            const now = Date.now();
            const name = typeof user.username === 'string' && user.username.trim().length > 0 ? user.username.trim() : 'Someone';
            const expiresAtRaw = payload.data?.expires_at;
            const parsedExpiry = typeof expiresAtRaw === 'string' ? Date.parse(expiresAtRaw) : Number.NaN;
            const fallbackExpiry = now + TYPING_EVENT_FALLBACK_MS;
            const expiresAt = Number.isFinite(parsedExpiry) ? Math.max(parsedExpiry, fallbackExpiry) : fallbackExpiry;

            if (payload.data?.active === false) {
              setTypingByChannel((previous) => {
                const existing = previous[channelId];
                if (!existing || existing.length === 0) {
                  return previous;
                }

                const filtered = existing.filter((entry) => entry.id !== typingUserId);
                if (filtered.length === existing.length) {
                  return previous;
                }

                if (filtered.length > 0) {
                  return { ...previous, [channelId]: filtered };
                }

                const { [channelId]: _, ...rest } = previous;
                return rest;
              });
              return;
            }

            setTypingByChannel((previous) => {
              const existing = previous[channelId] ?? [];
              const filtered = existing.filter((entry) => entry.id !== typingUserId && entry.expiresAt > now);
              const nextEntry: TypingEntry = {
                id: typingUserId,
                name,
                expiresAt,
              };
              const updated = [...filtered, nextEntry];

              const next = { ...previous, [channelId]: updated };
              return next;
            });

            return;
          }

          if (payload.type === 'channel.created') {
            const createdChannel = payload.data?.channel;
            const serverId = payload.data?.server_id;

            if (!createdChannel) {
              return;
            }

            if (
              selectedServerIdRef.current &&
              typeof serverId === 'number' &&
              selectedServerIdRef.current !== serverId
            ) {
              return;
            }

              setChannels((previous) => {
                if (!previous) {
                  return previous;
                }

                const next = normalizeChannelList([...previous, createdChannel]);

                if (!selectedChannelIdRef.current && createdChannel.type === 'text') {
                  setSelectedChannel(createdChannel);
                }

                return next;
              });
            return;
          }
          if (payload.type === 'webrtc.offer') {
            const data = (payload.data ?? {}) as Record<string, unknown>;
            void handleIncomingOffer(data);
            return;
          }

          if (payload.type === 'webrtc.answer') {
            const data = (payload.data ?? {}) as Record<string, unknown>;
            void handleIncomingAnswer(data);
            return;
          }

          if (payload.type === 'webrtc.ice_candidate') {
            const data = (payload.data ?? {}) as Record<string, unknown>;
            void handleIncomingCandidate(data);
            return;
          }
        } catch (error) {
          console.warn('Failed to parse websocket payload', error);
        }
      };

      const handleOpen = () => {
        setWsStatus('connected');
        clearRetryTimeout();

        const activeChannelId = selectedChannelIdRef.current;
        if (activeChannelId) {
          socket.send(
            JSON.stringify({
              type: 'channel.select',
              channel_id: activeChannelId,
            })
          );
        }

        const activeSession = webrtcSessionRef.current;
        if (activeSession) {
          authenticateWebRTCSession(activeSession);
        } else if (pendingWebRTCAuthRef.current) {
          const pending = pendingWebRTCAuthRef.current;
          const sent = sendWebSocketMessage({
            type: 'session.authenticate',
            data: {
              session_token: pending.sessionToken,
              channel_id: pending.channelId,
            },
          });
          if (sent) {
            pendingWebRTCAuthRef.current = null;
          }
        }
      };

      const handleClose = () => {
        if (manualClose) {
          return;
        }

        if (wsRef.current === socket) {
          wsRef.current = null;
        }

        setWsStatus('error');
        scheduleReconnect();
      };

      const handleError = () => {
        if (manualClose) {
          return;
        }

        setWsStatus('error');
        scheduleReconnect();
      };

      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', handleClose);
      socket.addEventListener('error', handleError);

      return () => {
        manualClose = true;

        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('close', handleClose);
        socket.removeEventListener('error', handleError);

        try {
          socket.close();
        } catch (closeError) {
          console.debug('Socket close during cleanup failed', closeError);
        }

        if (wsRef.current === socket) {
          wsRef.current = null;
        }
      };
    } catch (connectionError) {
      console.error('Failed to establish websocket connection', connectionError);
      setWsStatus('error');
      scheduleReconnect();
    }
  }, [
    normalizeChannelList,
    scheduleReconnect,
    clearRetryTimeout,
    wsRetryCount,
    authenticateWebRTCSession,
    sendWebSocketMessage,
    updateWebRTCState,
    getOrCreatePeerConnection,
    closePeerConnection,
    handleIncomingOffer,
    handleIncomingAnswer,
    handleIncomingCandidate,
    teardownWebRTCSession,
    setAutoScrollOnNextRender,
  ]);

  useEffect(() => {
    const handleOffline = () => {
      setWsStatus('error');

      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(4001, 'offline');
        }
      } catch (offlineError) {
        console.info('Websocket close on offline failed', offlineError);
      }

      scheduleReconnect();
    };

    const handleOnline = () => {
      clearRetryTimeout();
      setWsStatus('connecting');
      setWsRetryCount((count) => count + 1);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [clearRetryTimeout, scheduleReconnect]);

  useEffect(() => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !selectedChannel) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'channel.select',
        channel_id: selectedChannel.id,
      })
    );
  }, [selectedChannel]);

  useEffect(() => () => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
    }
  }, []);

  useEffect(() => () => {
    dragCounterRef.current = 0;
  }, []);

  useEffect(() => {
    if (!selectedChannel || selectedChannel.type !== 'text') {
      return;
    }
    messageInputRef.current?.focus();
  }, [selectedChannel]);

  useEffect(() => {
    if (!previewAttachment) {
      return;
    }

  const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewAttachment(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewAttachment]);

  const handleServerSelect = (server: Server) => {
    setSelectedServer(server);
    setSelectedChannel(null);
    setMessages([]);
  };

  const handleChannelSelect = (channel: Channel) => {
    setSelectedChannel(channel);
  };

  const handleMessageChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setMessageInput(value);

    if (!selectedChannel || selectedChannel.type !== 'text') {
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const handleMessageBlur = useCallback(() => {
    stopTyping();
  }, [stopTyping]);

  const processFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }

      if (!selectedChannel || selectedChannel.type !== 'text') {
        setError('Attachments are only supported in text channels.');
        window.setTimeout(() => setError(''), 4000);
        return;
      }

      const files = Array.from(fileList);
      for (const file of files) {
        const trackerId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        setUploadQueue((prev) => [...prev, { id: trackerId, name: file.name, status: 'uploading' }]);

        const contentType = file.type || 'application/octet-stream';

        const channelId = selectedChannel.id;
        let createdMessage: Message | null = null;

        if (!skipDirectUploadRef.current) {
          try {
            const signature = await uploadsAPI.createPresignedUpload(channelId, {
              file_name: file.name,
              content_type: contentType,
              file_size: file.size,
            });

            const headers = new Headers();
            const signedHeaders = signature.headers ?? {};
            Object.entries(signedHeaders).forEach(([key, value]) => {
              const normalized = key.toLowerCase();
              if (normalized === 'host' || normalized === 'content-length') {
                return;
              }
              if (typeof value === 'string' && value.trim().length > 0) {
                headers.set(key, value);
              }
            });

            if (!headers.has('Content-Type')) {
              headers.set('Content-Type', contentType);
            }

            const uploadResponse = await fetch(signature.upload_url, {
              method: signature.method || 'PUT',
              headers,
              body: file,
              mode: 'cors',
              cache: 'no-store',
              keepalive: true,
            });

            if (!uploadResponse.ok) {
              throw new Error(`Upload failed with status ${uploadResponse.status}`);
            }

            const payload = {
              content: '',
              type: 'file' as const,
              attachments: [
                {
                  object_key: signature.object_key,
                  url: signature.file_url,
                  file_name: file.name,
                  content_type: contentType,
                  file_size: file.size,
                },
              ],
            };

            const response = await channelsAPI.createMessage(channelId, payload);
            createdMessage = response.data.message;
          } catch (uploadError) {
            console.error('Direct upload failed, switching to fallback upload', uploadError);
            skipDirectUploadRef.current = true;
          }
        }

        if (!createdMessage) {
          try {
            const fallbackResponse = await uploadsAPI.uploadAttachmentMessage(channelId, file);
            createdMessage = fallbackResponse.data.message;
          } catch (fallbackError) {
            console.error('Fallback upload failed', fallbackError);
            const message = fallbackError instanceof Error ? fallbackError.message : 'Failed to upload file';
            setUploadQueue((prev) =>
              prev.map((entry) =>
                entry.id === trackerId ? { ...entry, status: 'error', error: message } : entry
              )
            );
            setError(message);
            window.setTimeout(() => setError(''), 5000);
            continue;
          }
        }

        if (createdMessage) {
          const messageToInsert = createdMessage;

          const willScroll = setAutoScrollOnNextRender();
          let inserted = false;
          setMessages((previous) => {
            if (previous.some((existing) => existing.id === messageToInsert.id)) {
              return previous;
            }
            inserted = true;
            return [...previous, messageToInsert];
          });

          if (inserted) {
            setMessagesCursor((current) => current ?? messageToInsert.created_at);
            if (willScroll) {
              setUnreadMessageCount(0);
            } else {
              setUnreadMessageCount((count) => count + 1);
            }
          }

          setUploadQueue((prev) =>
            prev.map((entry) => (entry.id === trackerId ? { ...entry, status: 'success' } : entry))
          );

          window.setTimeout(() => {
            setUploadQueue((prev) => prev.filter((entry) => entry.id !== trackerId));
          }, 1800);

          messageInputRef.current?.focus();
        }
      }
    },
    [selectedChannel, setAutoScrollOnNextRender]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      processFiles(event.target.files);
      event.target.value = '';
    },
    [processFiles]
  );

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!selectedChannel || selectedChannel.type !== 'text') {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [selectedChannel]
  );

  const handleDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!selectedChannel || selectedChannel.type !== 'text') {
        return;
      }
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    },
    [selectedChannel]
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      processFiles(event.dataTransfer?.files ?? null);
    },
    [processFiles]
  );

  const sendMessage = useCallback(async () => {
    if (isSendingMessage) {
      return;
    }

    if (!selectedChannel || selectedChannel.type !== 'text' || wsStatus !== 'connected') {
      return;
    }

    const trimmed = messageInput.trim();
    if (!trimmed) {
      stopTyping();
      return;
    }

    stopTyping();

    try {
      setIsSendingMessage(true);
      const response = await channelsAPI.createMessage(selectedChannel.id, {
        content: trimmed,
        type: 'text',
      });
      const newMessage = response.data.message;

      const willScroll = setAutoScrollOnNextRender();
      let inserted = false;
      setMessages((previous) => {
        if (previous.some((existing) => existing.id === newMessage.id)) {
          return previous;
        }
        inserted = true;
        return [...previous, newMessage];
      });

      if (inserted) {
        setMessagesCursor((current) => current ?? newMessage.created_at);
        if (willScroll) {
          setUnreadMessageCount(0);
        } else {
          setUnreadMessageCount((count) => count + 1);
        }
      }

      setMessageInput('');
    } catch (err) {
      setError('Failed to send message. Please try again.');
      window.setTimeout(() => setError(''), 5000);
    } finally {
      setIsSendingMessage(false);
      messageInputRef.current?.focus();
    }
  }, [
    isSendingMessage,
    selectedChannel,
    wsStatus,
    messageInput,
    setAutoScrollOnNextRender,
    stopTyping,
  ]);

  const handleSendMessage = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void sendMessage();
    },
    [sendMessage]
  );

  const handleMessageKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  const openServerActionDialog = useCallback(() => {
    setIsServerActionOpen(true);
  }, []);

  const closeServerActionDialog = useCallback(() => {
    setIsServerActionOpen(false);
  }, []);

  const handleCreateServer = () => {
    setIsServerActionOpen(false);
    if (navigate) {
      navigate('/create-server');
    }
  };

  const handleJoinServer = () => {
    setIsServerActionOpen(false);
  };

  const formatTimestamp = useCallback((value: string) => {
    if (!value) {
      return '';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const formatFileSize = useCallback((size: number) => {
    if (!Number.isFinite(size) || size <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : value < 10 ? 1 : 0)} ${units[unitIndex]}`;
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewAttachment(null);
  }, []);

  const handlePreviewAttachment = useCallback((attachment: MessageAttachment) => {
    setPreviewAttachment(attachment);
  }, []);

  const handleOpenCreateChannel = useCallback(() => {
    if (!selectedServer || !canManageChannels) {
      return;
    }

    setCreateChannelForm({ name: '', description: '', type: 'text' });
    setCreateChannelError('');
    setIsCreateChannelOpen(true);
  }, [selectedServer, canManageChannels]);

  const handleCloseCreateChannel = useCallback(() => {
    setIsCreateChannelOpen(false);
    setCreateChannelError('');
  }, []);

  const handleCreateChannelNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setCreateChannelForm((previous) => ({ ...previous, name: value }));
  }, []);

  const handleCreateChannelDescriptionChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target;
    setCreateChannelForm((previous) => ({ ...previous, description: value }));
  }, []);

  const handleCreateChannelTypeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value === 'audio' ? 'audio' : 'text';
    setCreateChannelForm((previous) => ({ ...previous, type: next }));
  }, []);

  const handleCreateChannelSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!selectedServer || !canManageChannels) {
        return;
      }

      const trimmedName = createChannelForm.name.trim();
      const trimmedDescription = createChannelForm.description.trim();

      if (!trimmedName) {
        setCreateChannelError('Channel name is required.');
        return;
      }

      setIsCreatingChannel(true);
      setCreateChannelError('');

      try {
        const response = await channelsAPI.createChannel({
          name: trimmedName,
          description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
          type: createChannelForm.type,
          server_id: selectedServer.id,
        });

        const newChannel = response.data.channel;
        setChannels((previous) => normalizeChannelList([...previous, newChannel]));
        setSelectedChannel(newChannel);
        setIsCreateChannelOpen(false);
        setCreateChannelForm({ name: '', description: '', type: 'text' });
      } catch (submitError) {
        let message = 'Failed to create channel';
        if (typeof submitError === 'object' && submitError !== null && 'response' in submitError) {
          const responseData = (submitError as {
            response?: { data?: { error?: string; message?: string } };
          }).response?.data;
          message = responseData?.error || responseData?.message || message;
        } else if (submitError instanceof Error) {
          message = submitError.message;
        }

        setCreateChannelError(message);
      } finally {
        setIsCreatingChannel(false);
      }
    },
    [selectedServer, canManageChannels, createChannelForm, normalizeChannelList]
  );

  const previewAttachmentIsVideo = Boolean(
    previewAttachment && (previewAttachment.content_type || '').startsWith('video/')
  );

  const previewAttachmentIsImage = Boolean(
    previewAttachment && (previewAttachment.content_type || '').startsWith('image/')
  );

  const handleManualReconnect = useCallback(() => {
    if (wsStatus === 'connected' || wsStatus === 'connecting') {
      return;
    }
    clearRetryTimeout();
    setWsStatus('connecting');
    setWsRetryCount((count) => count + 1);
  }, [clearRetryTimeout, wsStatus]);

  const handleJumpToBottom = useCallback(() => {
    const container = messageListRef.current;
    const willScroll = setAutoScrollOnNextRender(true);
    setUnreadMessageCount(0);

    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }

    if (!willScroll) {
      forceScrollToBottomRef.current = true;
    }
  }, [setAutoScrollOnNextRender]);

  const fetchOlderMessages = useCallback(async () => {
    if (!selectedChannel || selectedChannel.type !== 'text') {
      return;
    }

    if (!hasMoreMessages || isLoadingOlderMessages || isLoadingMessages || !messagesCursor) {
      return;
    }

    const container = messageListRef.current;
    if (container) {
      previousScrollHeightRef.current = container.scrollHeight;
      previousScrollTopRef.current = container.scrollTop;
    }

    isPrependingRef.current = true;
    forceScrollToBottomRef.current = false;

    try {
      setIsLoadingOlderMessages(true);
      const result = await channelsAPI.getMessages(selectedChannel.id, {
        limit: MESSAGE_PAGE_SIZE,
        before: messagesCursor,
      });

      const fetchedMessages = result?.messages ?? [];
      if (fetchedMessages.length > 0) {
        setMessages((previous) => [...fetchedMessages, ...previous]);
        const nextCursor = result?.next_cursor ?? fetchedMessages[0]?.created_at ?? messagesCursor;
        setMessagesCursor(nextCursor);
        setHasMoreMessages(result?.has_more ?? false);
      } else {
        setHasMoreMessages(false);
        isPrependingRef.current = false;
      }
    } catch (error) {
      console.error('Failed to load older messages', error);
      isPrependingRef.current = false;
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [selectedChannel, hasMoreMessages, isLoadingOlderMessages, isLoadingMessages, messagesCursor]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (container.scrollTop <= 120) {
        fetchOlderMessages();
      }

      const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
      if (distanceFromBottom <= 160) {
        setUnreadMessageCount(0);
      }
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [fetchOlderMessages]);

  const typingIndicatorMessage = useMemo(() => {
    if (!selectedChannel) {
      return '';
    }

    const entries = typingByChannel[selectedChannel.id] ?? [];
    if (entries.length === 0) {
      return '';
    }

    const now = Date.now();
    const active = entries.filter((entry) => entry.expiresAt > now);
    if (active.length === 0) {
      return '';
    }

    active.sort((a, b) => a.expiresAt - b.expiresAt);

    const seen = new Set<number>();
    const names: string[] = [];
    for (let index = 0; index < active.length; index += 1) {
      const entry = active[index];
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      const label = entry.name.trim() || 'Someone';
      names.push(label);
    }

    if (names.length === 0) {
      return '';
    }

    if (names.length === 1) {
      return `${names[0]} is typing…`;
    }

    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing…`;
    }

    const remaining = names.length - 2;
    const suffix = remaining === 1 ? 'other' : 'others';
    return `${names[0]}, ${names[1]}, and ${remaining} ${suffix} are typing…`;
  }, [selectedChannel, typingByChannel]);

  const filteredMessages = useMemo(() => messages, [messages]);
  const groupedMessages = useMemo(() => {
    if (!filteredMessages.length) {
      return [] as Array<{
        key: string;
        userId: number | null;
        username: string;
        avatar?: string | null;
        initials: string;
        firstTimestamp: string;
        messages: Message[];
      }>;
    }

    const groups: Array<{
      key: string;
      userId: number | null;
      username: string;
      avatar?: string | null;
      initials: string;
      firstTimestamp: string;
      messages: Message[];
    }> = [];

    filteredMessages.forEach((msg) => {
      const username = msg.user?.username?.trim() || 'Member';
      const avatar = msg.user?.avatar ?? null;
      const userId = msg.user_id ?? null;
      const initials = username
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'U';

      const lastGroup = groups[groups.length - 1];
      const sameAuthor =
        lastGroup &&
        lastGroup.userId === userId &&
        lastGroup.username.toLowerCase() === username.toLowerCase();

      if (sameAuthor) {
        lastGroup.messages.push(msg);
        return;
      }

      groups.push({
        key: `${msg.id}-${userId ?? 'anon'}`,
        userId,
        username,
        avatar,
        initials,
        firstTimestamp: msg.created_at,
        messages: [msg],
      });
    });

    return groups;
  }, [filteredMessages]);

  const audioParticipants = useMemo(() => {
    if (!webrtcState) {
      return [] as WebRTCParticipant[];
    }

    return normalizeParticipantRoster([webrtcState.participant, ...webrtcState.participants]);
  }, [webrtcState]);

  const activeAudioChannel = useMemo(() => {
    if (!webrtcState) {
      return null;
    }

    return channels.find((channel) => channel.id === webrtcState.channelId) ?? null;
  }, [channels, webrtcState]);

  useEffect(() => {
    if (!webrtcState || !webrtcState.participant?.media_state) {
      updateLocalMediaState(DEFAULT_MEDIA_STATE, { broadcast: false });
      return;
    }

    const normalized = mergeMediaState(DEFAULT_MEDIA_STATE, webrtcState.participant.media_state);
    updateLocalMediaState(normalized, { broadcast: false });
  }, [updateLocalMediaState, webrtcState]);

  useEffect(() => {
    if (!webrtcState || webrtcState.status !== 'connected') {
      return;
    }

    let cancelled = false;

    const prepareLocalMedia = async () => {
      const stream = await ensureLocalMedia({ video: localMediaState.camera === 'on' });
      if (!stream || cancelled) {
        return;
      }

      stream.getAudioTracks().forEach((track) => {
        track.enabled = localMediaState.mic === 'on';
      });

      const previewElement = localPreviewRef.current;
      if (previewElement && previewElement.srcObject !== stream) {
        previewElement.srcObject = stream;
        previewElement.muted = true;
      }
    };

    void prepareLocalMedia();

    return () => {
      cancelled = true;
    };
  }, [ensureLocalMedia, localMediaState.camera, localMediaState.mic, webrtcState]);

  useEffect(() => {
    remoteMediaElementsRef.current.forEach((element, userId) => {
      if (!element) {
        return;
      }

      const stream = remoteMediaStreams[userId];
      if (!stream) {
        if (element.srcObject) {
          element.srcObject = null;
        }
        return;
      }

      if (element.srcObject !== stream) {
        element.srcObject = stream;
        element.playsInline = true;
      }
    });
  }, [remoteMediaStreams]);

  useEffect(() => {
    remoteAudioElementsRef.current.forEach((element, userId) => {
      if (!element) {
        return;
      }

      const stream = remoteMediaStreams[userId];
      if (!stream) {
        if (element.srcObject) {
          element.srcObject = null;
        }
        return;
      }

      if (element.srcObject !== stream) {
        element.srcObject = stream;
      }

  element.autoplay = true;
      element.muted = false;
      element.volume = 1;

      const playResult = element.play();
      if (playResult && typeof playResult.catch === 'function') {
        void playResult.catch(() => undefined);
      }
    });
  }, [remoteMediaStreams]);

  useEffect(() => {
    if (webrtcState) {
      return;
    }

    remoteAudioElementsRef.current.forEach((element) => {
      if (element.srcObject) {
        element.srcObject = null;
      }
    });
    remoteAudioElementsRef.current.clear();
  }, [webrtcState]);

  useEffect(() => {
    const previewElement = localPreviewRef.current;
    const stream = localMediaStreamRef.current;
    if (previewElement && stream && previewElement.srcObject !== stream) {
      previewElement.srcObject = stream;
      previewElement.muted = true;
    }
  }, [localMediaState.camera, localMediaState.mic]);

  useEffect(() => {
    if (!webrtcState || webrtcState.status !== 'connected') {
      return;
    }

    const selfId = currentUserIdRef.current;
    if (!selfId) {
      return;
    }

    webrtcState.participants.forEach((participant) => {
      if (participant.user_id && participant.user_id !== selfId) {
        void getOrCreatePeerConnection(participant.user_id);
      }
    });
  }, [getOrCreatePeerConnection, webrtcState]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      if (isPrependingRef.current) {
        const previousHeight = previousScrollHeightRef.current;
        const previousTop = previousScrollTopRef.current;
        const nextTop = container.scrollHeight - previousHeight + previousTop;
        container.scrollTop = nextTop;
        isPrependingRef.current = false;
        return;
      }

      ensurePinnedToBottom();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [groupedMessages, ensurePinnedToBottom]);

  useEffect(() => {
    const container = messageListRef.current;
    const content = messageListContentRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => ensurePinnedToBottom());
    observer.observe(container);
    if (content) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, [ensurePinnedToBottom]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const handleMediaLoad = () => {
      window.requestAnimationFrame(() => ensurePinnedToBottom());
    };

    container.addEventListener('load', handleMediaLoad, true);

    return () => {
      container.removeEventListener('load', handleMediaLoad, true);
    };
  }, [ensurePinnedToBottom]);

  const webrtcStatusLabel = useMemo(() => {
    if (!webrtcState) {
      return 'Not connected';
    }

    switch (webrtcState.status) {
      case 'connected':
        return 'Connected';
      case 'authenticating':
        return 'Joining…';
      case 'error':
        return 'Error';
      default:
        return 'Not connected';
    }
  }, [webrtcState]);
  const isCurrentAudioSession = Boolean(
    webrtcState && selectedChannel && webrtcState.channelId === selectedChannel.id
  );
  const showJoinAudioButton = !isCurrentAudioSession || webrtcState?.status === 'error';
  const joinAudioDisabled = isJoiningWebRTC || webrtcState?.status === 'authenticating';
  const audioControlsDisabled = !webrtcState || webrtcState.status !== 'connected' || isJoiningWebRTC;
  const audioSessionName = activeAudioChannel?.name ?? (webrtcState ? `Channel ${webrtcState.channelId}` : 'No audio session');
  const audioSessionPrefix = activeAudioChannel?.type === 'audio' || activeAudioChannel === null ? '🎧' : '#';
  const audioParticipantCount = audioParticipants.length;
  const audioParticipantLabel = audioParticipantCount === 1 ? 'participant' : 'participants';
  const isAudioSessionConnected = webrtcState?.status === 'connected';
  const audioIndicatorClasses = isAudioSessionConnected
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 shadow-lg shadow-emerald-500/10'
    : 'border-slate-800/70 bg-slate-900/70 text-slate-200';
  const audioStatusBadgeClass = (() => {
    if (webrtcState?.status === 'connected') {
      return 'bg-emerald-500/20 text-emerald-100';
    }

    if (webrtcState?.status === 'authenticating') {
      return 'bg-amber-500/20 text-amber-100';
    }

    if (webrtcState?.status === 'error') {
      return 'bg-red-500/20 text-red-200';
    }

    return 'bg-slate-800 text-slate-300';
  })();
  const audioSessionInfoText = (() => {
    if (!webrtcState) {
      return 'Join an audio channel to start a live conversation.';
    }

    switch (webrtcState.status) {
      case 'connected':
        return `${audioParticipantCount} ${audioParticipantLabel} in session`;
      case 'authenticating':
        return 'Connecting to audio channel…';
      case 'error':
        return 'We hit a snag joining this room. Try rejoining from the channel list.';
      default:
        return 'Join an audio channel to start a live conversation.';
    }
  })();

  const canSendMessages = Boolean(selectedChannel && selectedChannel.type === 'text');
  const messagePlaceholder = selectedChannel
    ? `Message #${selectedChannel.name} (Markdown supported)`
    : 'Select a channel to chat';
  const showConnectionOverlay = wsStatus !== 'connected';

  const overlayCopy = useMemo(() => {
    switch (wsStatus) {
      case 'connecting':
        return {
          title: 'Connecting to live updates…',
          body: 'Hang tight while we establish a realtime link to your workspace.',
        };
      case 'error':
        return {
          title: 'Realtime connection lost',
          body: 'We’re retrying every 10 seconds. You can retry manually if you need to jump back in sooner.',
        };
      case 'idle':
      default:
        return {
          title: 'Preparing realtime session…',
          body: 'Setting up the websocket bridge so messages arrive instantly.',
        };
    }
  }, [wsStatus]);

  const spinnerStateClass = useMemo(() => {
    if (wsStatus === 'connecting') {
      return 'border-t-transparent animate-spin';
    }

    if (wsStatus === 'error') {
      return 'border-dashed animate-pulse';
    }

    return 'animate-pulse';
  }, [wsStatus]);

    return {
      state: {
        servers,
        selectedServer,
        channels,
        selectedChannel,
        messages,
        hasMoreMessages,
        messagesCursor,
        isLoadingOlderMessages,
        unreadMessageCount,
        messageInput,
        isServerActionOpen,
        isLoadingServers,
        isLoadingChannels,
        isLoadingMessages,
        isSendingMessage,
        error,
        wsStatus,
        wsRetryCount,
        uploadQueue,
        isDragActive,
        previewAttachment,
        composerMaxHeight,
        currentUser,
        typingByChannel,
        isCreateChannelOpen,
        isCreatingChannel,
        createChannelError,
        createChannelForm,
        webrtcState,
        isJoiningWebRTC,
        webrtcError,
        localMediaState,
        remoteMediaStreams,
        mediaPermissionError,
      },
      derived: {
        canManageChannels,
        typingIndicatorMessage,
        filteredMessages,
        groupedMessages,
        audioParticipants,
        activeAudioChannel,
        previewAttachmentIsVideo,
        previewAttachmentIsImage,
        showJoinAudioButton,
        joinAudioDisabled,
        audioControlsDisabled,
        audioSessionName,
        audioSessionPrefix,
        audioParticipantCount,
        audioParticipantLabel,
        isAudioSessionConnected,
        audioIndicatorClasses,
        audioStatusBadgeClass,
        audioSessionInfoText,
        canSendMessages,
        messagePlaceholder,
        showConnectionOverlay,
        overlayCopy,
        spinnerStateClass,
        webrtcStatusLabel,
      },
      refs: {
        messageInputRef,
        messageListRef,
        messageListContentRef,
        fileInputRef,
        localPreviewRef,
        localMediaStreamRef,
        remoteMediaElementsRef,
        remoteAudioElementsRef,
      },
      actions: {
        handleServerSelect,
        handleChannelSelect,
        handleMessageChange,
        handleMessageBlur,
        handleMessageKeyDown,
        handleSendMessage,
        handleOpenFilePicker,
        handleFileInputChange,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        handleManualReconnect,
        handleJumpToBottom,
        handleToggleMic,
        handleToggleCamera,
        handleJoinAudioChannel,
        handleLeaveAudioChannel,
        handleCreateServer,
        handleJoinServer,
        handleClosePreview,
        handlePreviewAttachment,
        handleOpenCreateChannel,
        handleCloseCreateChannel,
        handleCreateChannelNameChange,
        handleCreateChannelDescriptionChange,
        handleCreateChannelTypeChange,
        handleCreateChannelSubmit,
        openServerActionDialog,
        closeServerActionDialog,
      },
      utils: {
        formatTimestamp,
        formatFileSize,
        mergeMediaState,
        DEFAULT_MEDIA_STATE,
      },
    };
  };

