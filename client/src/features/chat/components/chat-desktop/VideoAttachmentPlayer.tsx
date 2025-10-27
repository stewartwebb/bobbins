import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageAttachment } from '../../../../types';
import {
  IconFullscreenEnter,
  IconFullscreenExit,
  IconPause,
  IconPlay,
  IconVolume,
  IconVolumeMute,
} from './Icons';

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
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const formatTimestamp = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
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
    setVolume(video.volume);
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

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleVolumeSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const nextVolume = Number(event.target.value);
    video.volume = Number.isFinite(nextVolume) ? Math.max(0, Math.min(1, nextVolume)) : video.volume;
    setVolume(video.volume);
    
    if (video.volume > 0 && video.muted) {
      video.muted = false;
    }
    setIsMuted(video.muted || video.volume === 0);
  }, []);

  const handleVolumeChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setIsMuted(video.muted || video.volume === 0);
    setVolume(video.volume);
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

    const exitFullscreen = doc.exitFullscreen?.bind(doc) || doc.webkitExitFullscreen?.bind(doc);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.pause();
    video.currentTime = 0;
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setIsMuted(video.muted || video.volume === 0);
    setVolume(video.volume);
  }, [attachment.id]);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/80 shadow-sm shadow-slate-900/40">
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={attachment.url}
          className="block h-auto max-h-[70vh] w-full bg-black object-contain cursor-pointer"
          preload="metadata"
                  disablePictureInPicture
       
          poster={attachment.preview_url}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
          onVolumeChange={handleVolumeChange}
          onClick={handleTogglePlay}
        />
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity hover:bg-black/40"
          >
            <button
              type="button"
              onClick={handleTogglePlay}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-500/95 text-slate-950 shadow-2xl shadow-primary-500/50 transition hover:bg-primary-400 hover:scale-110"
              aria-label="Play video"
            >
              <IconPlay className="h-10 w-10 ml-1" />
            </button>
          </div>
        )}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 pointer-events-none">
          <div className="flex items-center justify-between gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500/90 text-slate-950 shadow-lg shadow-primary-500/30 transition hover:bg-primary-400"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
            >
              {isPlaying ? <IconPause className="h-5 w-5" /> : <IconPlay className="h-5 w-5" />}
            </button>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-slate-200">
                <span>{formatTimestamp(progress)}</span>
                <span>{formatTimestamp(duration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={progress}
                onChange={handleSeek}
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900 text-primary-200 shadow-sm shadow-slate-900/40 transition hover:border-primary-400/60 hover:text-primary-100"
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              >
                {isMuted ? <IconVolumeMute /> : <IconVolume />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeSliderChange}
                className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                aria-label="Volume control"
              />
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900 text-primary-200 shadow-sm shadow-slate-900/40 transition hover:border-primary-400/60 hover:text-primary-100"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <IconFullscreenExit /> : <IconFullscreenEnter />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/70 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{attachment.file_name}</p>
          <p className="font-mono text-[10px] text-slate-500">
            {(attachment.content_type || 'video')} · {formatFileSize(attachment.file_size)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleViewOriginal}
          className="rounded-md border border-primary-400/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary-200 transition hover:bg-primary-400/10"
        >
          View original
        </button>
      </div>
    </div>
  );
};

export default VideoAttachmentPlayer;
