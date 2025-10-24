import React, {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { authAPI, buildWebSocketURL, channelsAPI, serversAPI, uploadsAPI } from '../services/api';
import type { Channel, Message, MessageAttachment, Server, User } from '../types';

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
  };
};

type UploadStatus = 'uploading' | 'success' | 'error';

type UploadTracker = {
  id: string;
  name: string;
  status: UploadStatus;
  error?: string;
};

const EMPTY_STATES = {
  noChannel: {
    title: 'Choose a channel',
    body: 'Pick a channel from the sidebar to start collaborating.'
  },
  audioChannel: {
    title: 'Audio channels coming soon',
    body: 'Voice rooms are on the roadmap. For now, hop into a text channel to chat.'
  },
  emptyMessages: {
    title: 'This channel is quiet',
    body: 'Be the first to say hello and set the tone for the conversation.'
  }
} as const;

const MESSAGE_PAGE_SIZE = 50;
const TYPING_EVENT_FALLBACK_MS = 6000;
const TYPING_THROTTLE_MS = 2000;
const TYPING_PRUNE_INTERVAL_MS = 1000;

type TypingEntry = {
  id: number;
  name: string;
  expiresAt: number;
};

type IconProps = {
  className?: string;
};

const IconPlay: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7-11-7z" />
  </svg>
);

const IconPause: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
  </svg>
);

const IconVolume: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 9v6h3l4 4V5L8 9H5zm12.5 3a3.5 3.5 0 0 0-2.5-3.323v6.646A3.5 3.5 0 0 0 17.5 12zm-2.5-7.95v2.063A5.5 5.5 0 0 1 19.5 12a5.5 5.5 0 0 1-4.5 5.887v2.063A7.5 7.5 0 0 0 21.5 12 7.5 7.5 0 0 0 15 4.05z" />
  </svg>
);

const IconVolumeMute: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.5 12a3.5 3.5 0 0 1-2.5 3.323v2.063A5.5 5.5 0 0 0 18.5 12a5.46 5.46 0 0 0-.379-2L16.5 12zm0-5.323V4.614A7.5 7.5 0 0 1 21.5 12a7.47 7.47 0 0 1-1.142 3.934l-1.475-1.475A5.47 5.47 0 0 0 19.5 12a5.5 5.5 0 0 0-3-4.9z" />
    <path d="M5.707 4.293 4.293 5.707 8.586 10H5v4h3l4 4v-5.586l4.293 4.293 1.414-1.414z" />
  </svg>
);

const IconFullscreenEnter: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 4h6v2H6v4H4V4zm14 0v6h-2V6h-4V4h6zm0 16h-6v-2h4v-4h2v6zM4 20v-6h2v4h4v2H4z" />
  </svg>
);

const IconFullscreenExit: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M15 9h5V7h-3V4h-2v5zM9 9V4H7v3H4v2h5zm6 6v5h2v-3h3v-2h-5zM9 15H4v2h3v3h2v-5z" />
  </svg>
);

const IconArrowDown: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 16.5 5 9.5l1.4-1.4 5.6 5.59 5.6-5.6L19 9.5z" />
  </svg>
);

const markdownComponents: Components = {
  a: ({ children, ...props }) => (
    <a
      {...props}
      className="text-primary-300 underline transition hover:text-primary-100"
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  code({ inline, className, children, ...props }: any) {
    if (inline) {
      const combinedClassName = ['rounded bg-slate-900/80 px-1 py-[1px] font-mono text-[13px] text-primary-200', className]
        .filter(Boolean)
        .join(' ');

      return (
        <code className={combinedClassName} {...props}>
          {children}
        </code>
      );
    }

    const blockClassName = ['block font-mono text-xs leading-relaxed text-slate-100', className]
      .filter(Boolean)
      .join(' ');

    return (
      <pre className="overflow-x-auto rounded-lg border border-slate-800/70 bg-slate-950/80 p-3">
        <code className={blockClassName} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="border-l-2 border-primary-400/60 pl-3 text-sm italic text-primary-100/80"
    >
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className="list-disc space-y-1 pl-5 text-sm text-slate-200">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="list-decimal space-y-1 pl-5 text-sm text-slate-200">
      {children}
    </ol>
  ),
};

const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="space-y-2 text-sm leading-relaxed text-slate-200">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
      {content}
    </ReactMarkdown>
  </div>
);

type VideoAttachmentPlayerProps = {
  attachment: MessageAttachment;
  formatFileSize: (size: number) => string;
};

const VideoAttachmentPlayer: React.FC<VideoAttachmentPlayerProps> = ({ attachment, formatFileSize }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const formatTimestamp = useCallback((value: number) => {
    if (!Number.isFinite(value) || value < 0) {
      return '0:00';
    }

    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(1, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setDuration(video.duration || 0);
    setProgress(video.currentTime || 0);
    setIsMuted(video.muted || video.volume === 0);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setProgress(video.currentTime);
  }, []);

  const handleTogglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Failed to play video attachment', error);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const nextTime = Number(event.target.value);
    video.currentTime = Number.isFinite(nextTime) ? nextTime : 0;
    setProgress(video.currentTime);
  }, []);

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next || video.volume === 0);
  }, []);

  const handleVolumeChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setIsMuted(video.muted || video.volume === 0);
  }, []);

  const handleEnded = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
    }
    setIsPlaying(false);
    setProgress(0);
  }, []);

  const handleViewOriginal = useCallback(() => {
    window.open(attachment.url, '_blank', 'noopener,noreferrer');
  }, [attachment.url]);

  const handleToggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const doc = window.document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };

    const requestFullscreen =
      video.requestFullscreen?.bind(video) ||
      (video as HTMLVideoElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(video);

    const exitFullscreen =
      doc.exitFullscreen?.bind(doc) ||
      doc.webkitExitFullscreen?.bind(doc);

    const fullscreenElement = doc.fullscreenElement || doc.webkitFullscreenElement;

    if (fullscreenElement && exitFullscreen) {
      exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((error) => {
          console.error('Failed to exit fullscreen', error);
        });
      return;
    }

    if (requestFullscreen) {
      requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((error: unknown) => {
          console.error('Failed to enter fullscreen', error);
        });
    }
  }, []);

  useEffect(() => {
    const doc = window.document as Document & {
      webkitFullscreenElement?: Element | null;
    };

    const handleFullscreenChange = () => {
      const video = videoRef.current;
      const fullscreenElement = doc.fullscreenElement || doc.webkitFullscreenElement;
      setIsFullscreen(Boolean(fullscreenElement && video && fullscreenElement === video));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/80 shadow-sm shadow-slate-900/40">
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={attachment.url}
          className="h-full w-full bg-black"
          preload="metadata"
          poster={attachment.preview_url}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
          onVolumeChange={handleVolumeChange}
          playsInline
        />
        <button
          type="button"
          onClick={handleTogglePlay}
          className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition hover:bg-slate-950/20 focus:outline-none"
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {!isPlaying && (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-500/90 text-2xl font-semibold text-slate-950 shadow-lg shadow-primary-500/40">
              ▶
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-950/90 px-4 py-3 text-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900 text-primary-200 shadow-sm shadow-slate-900/40 transition hover:border-primary-400/60 hover:text-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step="0.01"
            value={progress}
            onChange={handleSeek}
            className="flex-1 accent-primary-400"
            aria-label="Seek video"
          />

          <span className="font-mono text-[11px] text-slate-400">
            {formatTimestamp(progress)} / {formatTimestamp(duration)}
          </span>

          <button
            type="button"
            onClick={handleToggleMute}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900 text-primary-200 shadow-sm shadow-slate-900/40 transition hover:border-primary-400/60 hover:text-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          >
            {isMuted ? <IconVolumeMute /> : <IconVolume />}
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900 text-primary-200 shadow-sm shadow-slate-900/40 transition hover:border-primary-400/60 hover:text-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <IconFullscreenExit /> : <IconFullscreenEnter />}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{attachment.file_name}</p>
            <p className="font-mono text-[10px] text-slate-500">
              {(attachment.content_type || 'video')} · {formatFileSize(attachment.file_size)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleViewOriginal}
            className="rounded-md border border-primary-400/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary-200 transition hover:bg-primary-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            View Original
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatPage: React.FC = () => {
  const navigate = useNavigate();

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

  useEffect(() => {
    selectedServerIdRef.current = selectedServer?.id ?? null;
  }, [selectedServer?.id]);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null;
  }, [selectedChannel?.id]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser?.id]);

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
          navigate('/login');
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
  }, [selectedChannel]);

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
  }, [normalizeChannelList, scheduleReconnect, clearRetryTimeout, wsRetryCount]);

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

    const handleKeyDown = (event: KeyboardEvent) => {
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
    [selectedChannel]
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
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!selectedChannel || selectedChannel.type !== 'text') {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [selectedChannel]
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!selectedChannel || selectedChannel.type !== 'text') {
        return;
      }
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    },
    [selectedChannel]
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
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
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  const handleCreateServer = () => {
    setIsServerActionOpen(false);
    navigate('/create-server');
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

  const renderAttachment = useCallback(
    (attachment: MessageAttachment) => {
      const isImage = (attachment.content_type || '').startsWith('image/');
      const isVideo = (attachment.content_type || '').startsWith('video/');
      const sizeLabel = formatFileSize(attachment.file_size);
      const previewSource = attachment.preview_url || attachment.url;

      if (isVideo) {
        if (!previewSource) {
          return (
            <VideoAttachmentPlayer
              key={attachment.id}
              attachment={attachment}
              formatFileSize={formatFileSize}
            />
          );
        }

        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => handlePreviewAttachment(attachment)}
            className="group block overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/60 text-left shadow-sm shadow-slate-900/30 transition hover:border-primary-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <div className="relative">
              <img
                src={previewSource}
                alt={`${attachment.file_name} thumbnail`}
                loading="lazy"
                className="max-h-64 w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-white opacity-0 transition group-hover:opacity-100">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950/80 text-2xl">
                  ▶
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-800/70 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
              <span className="truncate">{attachment.file_name}</span>
              <span className="font-mono text-[10px] text-slate-500">{sizeLabel}</span>
            </div>
          </button>
        );
      }

      if (isImage) {
        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => handlePreviewAttachment(attachment)}
            className="group block overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/60 text-left shadow-sm shadow-slate-900/30 transition hover:border-primary-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <img
              src={previewSource}
              alt={attachment.file_name}
              loading="lazy"
              className="max-h-72 w-full object-cover"
            />
            <div className="flex items-center justify-between gap-3 border-t border-slate-800/70 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
              <span className="truncate">{attachment.file_name}</span>
              <span className="font-mono text-[10px] text-slate-500">{sizeLabel}</span>
            </div>
          </button>
        );
      }

      return (
        <a
          key={attachment.id}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-4 rounded-lg border border-slate-800/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 transition hover:border-primary-400/60 hover:text-primary-100"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📎</span>
            <div className="flex flex-col">
              <span className="truncate font-medium">{attachment.file_name}</span>
              <span className="font-mono text-[10px] text-slate-500">
                {attachment.content_type || 'binary/octet-stream'} · {sizeLabel}
              </span>
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary-200">Open</span>
        </a>
      );
    },
    [formatFileSize, handlePreviewAttachment]
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

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 surface-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/85" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden w-16 flex-col items-center gap-3 border-r border-slate-800/70 bg-slate-950/80 px-2 py-6 md:flex">
          {isLoadingServers && (
            <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-800/60" />
          )}
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
            onClick={() => setIsServerActionOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-slate-700/80 text-slate-500 transition hover:border-primary-400 hover:text-primary-200"
          >
            +
          </button>
        </aside>

        <aside className="hidden w-64 flex-shrink-0 border-r border-slate-800/70 bg-slate-950/75 px-4 py-6 md:flex md:flex-col">
          <header className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Workspace</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{selectedServer?.name ?? 'Workspace'}</h2>
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              bafa@chat://{selectedChannel?.name ?? 'welcome'}
            </p>
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
              <p className="px-2 text-[11px] text-slate-500">No channels yet. Create one from the console.</p>
            )}
            {!isLoadingChannels &&
              channels.map((channel) => {
                const isActive = selectedChannel?.id === channel.id;
                const isAudioChannel = channel.type === 'audio' || channel.type === 'voice';
                const prefix = isAudioChannel ? '🎧' : '#';

                return (
                  <button
                    key={channel.id}
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
                      <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-300/70">audio soon</span>
                    )}
                  </button>
                );
              })}
          </nav>

          <div className="mt-8 rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">shortcuts</p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-400">
              <li>⌘K &nbsp; Switch channel</li>
              <li>/log &nbsp; Tail recent activity</li>
              <li>⌘⇧P &nbsp; Command palette</li>
            </ul>
          </div>
        </aside>

        <main className="flex flex-1 flex-col h-screen">
          <header className="flex items-center justify-between border-b border-slate-800/70 bg-slate-950/70 px-5 py-3">
            <div>
              <p className="font-mono text-[11px] text-slate-500">
          {isDragActive && (
            <div className="pointer-events-none absolute inset-6 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary-300/60 bg-slate-950/70">
              <div className="rounded-2xl border border-primary-300/40 bg-slate-950/90 px-6 py-4 text-center shadow-lg shadow-primary-500/20">
                <p className="text-sm font-semibold text-primary-100">Drop files to share</p>
                <p className="mt-2 text-xs text-slate-300">We’ll upload them directly to this channel.</p>
              </div>
            </div>
          )}
                bafa@chat:~/servers/{selectedServer?.id ?? 'workspace'}/{selectedChannel?.id ?? 'channel'}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-white">
                {selectedChannel ? `#${selectedChannel.name}` : 'Select a channel'}
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="hidden rounded-lg border border-slate-800/60 px-3 py-1 font-mono sm:inline-flex">
                {filteredMessages.length} entries
              </span>
              <button
                type="button"
                className="rounded-lg border border-slate-800/80 px-3 py-1 font-mono text-[11px] text-slate-300 transition hover:border-primary-400 hover:text-primary-100"
              >
                /channel settings
              </button>
            </div>
          </header>

          <section
            className="relative flex min-h-0 flex-1 flex-col"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto" ref={messageListRef}>
                <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" ref={messageListContentRef}>
                  {isLoadingOlderMessages && (
                    <div className="flex justify-center py-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      Loading earlier messages…
                    </div>
                  )}

                  {!selectedChannel && (
                    <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 px-6 py-10 text-center">
                      <h3 className="text-lg font-semibold text-white">{EMPTY_STATES.noChannel.title}</h3>
                      <p className="mt-2 text-sm text-slate-400">{EMPTY_STATES.noChannel.body}</p>
                    </div>
                  )}

                  {selectedChannel && selectedChannel.type !== 'text' && (
                    <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 px-6 py-10 text-center text-emerald-100">
                      <h3 className="text-lg font-semibold">{EMPTY_STATES.audioChannel.title}</h3>
                      <p className="mt-2 text-sm text-emerald-200/80">{EMPTY_STATES.audioChannel.body}</p>
                    </div>
                  )}

                  {selectedChannel && selectedChannel.type === 'text' && isLoadingMessages && (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-20 animate-pulse rounded-xl border border-slate-800/70 bg-slate-900/60" />
                      ))}
                    </div>
                  )}

                  {selectedChannel && selectedChannel.type === 'text' && !isLoadingMessages && filteredMessages.length === 0 && (
                    <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 px-6 py-10 text-center">
                      <h3 className="text-lg font-semibold text-white">{EMPTY_STATES.emptyMessages.title}</h3>
                      <p className="mt-2 text-sm text-slate-400">{EMPTY_STATES.emptyMessages.body}</p>
                    </div>
                  )}

                  {selectedChannel && selectedChannel.type === 'text' && !isLoadingMessages && groupedMessages.length > 0 && (
                    <div className="space-y-4">
                      {groupedMessages.map((group) => {
                        const headerTimestamp = formatTimestamp(group.firstTimestamp);

                        return (
                          <article
                            key={group.key}
                            className="group flex gap-3 rounded-lg px-3 py-2 transition hover:bg-slate-900/60"
                          >
                            <div className="mt-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-slate-900 text-xs font-semibold text-primary-200">
                              {group.avatar ? (
                                <img src={group.avatar} alt={group.username} className="h-full w-full object-cover" />
                              ) : (
                                <span>{group.initials}</span>
                              )}
                            </div>
                            <div className="flex flex-1 flex-col">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-semibold text-slate-100">{group.username}</span>
                                <span className="font-mono text-[11px] text-slate-500">{headerTimestamp}</span>
                              </div>
                              <div className="mt-2 space-y-4 text-sm leading-relaxed text-slate-200">
                                {group.messages.map((message, index) => {
                                  const hasContent = Boolean(message.content && message.content.trim().length > 0);
                                  const attachmentList = message.attachments ?? [];
                                  const showTimestamp = (() => {
                                    if (index === 0) {
                                      return false;
                                    }

                                    const previous = group.messages[index - 1];
                                    if (!previous) {
                                      return true;
                                    }

                                    const currentTime = new Date(message.created_at).getTime();
                                    const previousTime = new Date(previous.created_at).getTime();

                                    if (!Number.isFinite(currentTime) || !Number.isFinite(previousTime)) {
                                      return true;
                                    }

                                    return currentTime - previousTime >= 5 * 60 * 1000;
                                  })();

                                  return (
                                    <div key={message.id} className="flex flex-col gap-2">
                                      {showTimestamp && (
                                        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">
                                          {formatTimestamp(message.created_at)}
                                        </span>
                                      )}
                                      {hasContent && <MarkdownMessage content={message.content} />}
                                      {attachmentList.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                          {attachmentList.map((attachment) => renderAttachment(attachment))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {unreadMessageCount > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center md:bottom-8">
                <button
                  type="button"
                  onClick={handleJumpToBottom}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary-400/40 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-primary-100 shadow-lg shadow-primary-500/20 transition hover:border-primary-300 hover:text-primary-50 hover:shadow-primary-500/30"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/20 text-primary-200">
                    <IconArrowDown className="h-4 w-4" />
                  </span>
                  {unreadMessageCount === 1 ? '1 new message' : `${unreadMessageCount} new messages`}
                </button>
              </div>
            )}
          </section>
          <footer className="border-t border-slate-800/70 bg-slate-950/80 px-4 py-4">
            <form onSubmit={handleSendMessage} className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />
              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}
              {uploadQueue.length > 0 && (
                <div className="space-y-2 text-xs">
                  {uploadQueue.map((upload) => {
                    const statusLabel =
                      upload.status === 'uploading'
                        ? 'Uploading…'
                        : upload.status === 'success'
                          ? 'Shared'
                          : 'Failed';
                    const statusColor =
                      upload.status === 'success'
                        ? 'text-emerald-300'
                        : upload.status === 'error'
                          ? 'text-red-300'
                          : 'text-primary-200';

                    return (
                      <div
                        key={upload.id}
                        className="rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-slate-300"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate pr-3 font-mono text-[11px]">{upload.name}</span>
                          <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                        </div>
                        {upload.status === 'error' && upload.error && (
                          <p className="mt-1 font-mono text-[10px] text-red-300">{upload.error}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {typingIndicatorMessage && (
                <div className="font-mono text-[11px] text-slate-400">{typingIndicatorMessage}</div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  disabled={!canSendMessages || !selectedChannel || wsStatus !== 'connected'}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-800/70 bg-slate-950 text-slate-300 transition hover:border-primary-400 hover:text-primary-100 disabled:cursor-not-allowed disabled:text-slate-600"
                  aria-label="Attach files"
                >
                  📎
                </button>
                <div className="flex-1 rounded-lg border border-slate-800/70 bg-slate-950 px-3 py-2 focus-within:border-primary-400">
                  <label htmlFor="message" className="sr-only">
                    Message input
                  </label>
                  <textarea
                    id="message"
                    value={messageInput}
                    onChange={handleMessageChange}
                    onKeyDown={handleMessageKeyDown}
                    onBlur={handleMessageBlur}
                    ref={messageInputRef}
                    placeholder={messagePlaceholder}
                    disabled={!canSendMessages || !selectedChannel || wsStatus !== 'connected'}
                    rows={1}
                    aria-label="Message input"
                    aria-multiline="true"
                    className="min-h-[44px] w-full resize-none bg-transparent font-mono text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500"
                    style={{ maxHeight: composerMaxHeight }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSendMessages || isSendingMessage || wsStatus !== 'connected'}
                  className="rounded-lg bg-primary-400/90 px-4 py-2 font-mono text-sm font-semibold text-slate-950 shadow-md shadow-primary-500/30 transition hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-primary-300/60"
                >
                  {isSendingMessage ? 'sending…' : 'send ↵'}
                </button>
              </div>
              {!canSendMessages && selectedChannel && (
                <p className="text-center text-xs text-slate-500">
                  Messaging is only available in text channels. Choose another channel to chat.
                </p>
              )}
            </form>
          </footer>
        </main>
      </div>

      {previewAttachment && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 px-6 py-12 backdrop-blur"
          onClick={handleClosePreview}
        >
          <div
            className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/90 shadow-2xl shadow-slate-900/70"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleClosePreview}
              className="absolute right-4 top-4 rounded-full bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              aria-label="Close image preview"
            >
              X
            </button>

            <div className="flex items-center justify-center bg-slate-950">
              <img
                src={previewAttachment.url}
                alt={previewAttachment.file_name}
                className="max-h-[80vh] w-full object-contain"
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-950/95 px-6 py-4 text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{previewAttachment.file_name}</p>
                  <p className="text-xs text-slate-400">
                    {(previewAttachment.content_type || 'image')} · {formatFileSize(previewAttachment.file_size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(previewAttachment.url, '_blank', 'noopener,noreferrer')}
                  className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  View Original
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isServerActionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-800/80 bg-slate-950/95 p-6 shadow-2xl shadow-slate-900/40">
            <button
              type="button"
              onClick={() => setIsServerActionOpen(false)}
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

export default ChatPage;