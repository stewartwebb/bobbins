import React, { useCallback } from 'react';
import type { MessageAttachment } from '../../../../types';
import type { ChatController } from '../../hooks/useChatController';
import { IconArrowDown, IconMenu, IconMic, IconMicOff, IconPhone, IconScreenShare, IconVideo, IconVideoOff } from './Icons';
import MarkdownMessage from './MarkdownMessage';
import VideoAttachmentPlayer from './VideoAttachmentPlayer';

const EMPTY_STATES = {
  noChannel: {
    title: 'Choose a channel',
    body: 'Pick a channel from the sidebar to start collaborating.',
  },
  audioChannel: {
    title: 'Hop into voice',
    body: 'Join the audio channel to start a live conversation with your team.',
  },
  emptyMessages: {
    title: 'This channel is quiet',
    body: 'Be the first to say hello and set the tone for the conversation.',
  },
} as const;

type ChatMainAreaProps = {
  controller: ChatController;
  onOpenNavigation?: () => void;
};

const ChatMainArea: React.FC<ChatMainAreaProps> = ({ controller, onOpenNavigation }) => {
  const {
    state: {
      selectedServer,
      selectedChannel,
      isDragActive,
      isLoadingOlderMessages,
      isLoadingMessages,
      unreadMessageCount,
      uploadQueue,
      error,
      messageInput,
      wsStatus,
      isSendingMessage,
      composerMaxHeight,
      webrtcState,
      isJoiningWebRTC,
      webrtcError,
      localMediaState,
      remoteMediaStreams,
      mediaPermissionError,
      currentUser,
    },
    derived: {
      filteredMessages,
      groupedMessages,
      typingIndicatorMessage,
      audioParticipants,
      showJoinAudioButton,
      joinAudioDisabled,
      audioControlsDisabled,
      audioParticipantCount,
      audioParticipantLabel,
      webrtcStatusLabel,
      audioIndicatorClasses,
      audioStatusBadgeClass,
      audioSessionInfoText,
      canSendMessages,
      messagePlaceholder,
    },
    refs: {
      messageListRef,
      messageListContentRef,
      fileInputRef,
      messageInputRef,
      localPreviewRef,
      localMediaStreamRef,
      remoteMediaElementsRef,
    },
    actions: {
      handleDragEnter,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleJumpToBottom,
      handleSendMessage,
      handleMessageChange,
      handleMessageBlur,
      handleMessageKeyDown,
      handleOpenFilePicker,
      handleFileInputChange,
      handleJoinAudioChannel,
      handleToggleMic,
      handleToggleCamera,
      handleLeaveAudioChannel,
      handlePreviewAttachment,
    },
    utils: { formatTimestamp, formatFileSize, mergeMediaState, DEFAULT_MEDIA_STATE },
  } = controller;

  const renderAttachment = useCallback(
    (attachment: MessageAttachment) => {
      const isImage = (attachment.content_type || '').startsWith('image/');
      const isVideo = (attachment.content_type || '').startsWith('video/');
      const sizeLabel = formatFileSize(attachment.file_size);
      const previewSource = attachment.preview_url || attachment.url;

      if (isVideo) {
        return (
          <div key={attachment.id} className="w-full max-w-full sm:mx-auto sm:max-w-3xl">
            <VideoAttachmentPlayer attachment={attachment} formatFileSize={formatFileSize} />
          </div>
        );
      }

      if (isImage) {
        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => handlePreviewAttachment(attachment)}
            className="group block w-full max-w-full overflow-hidden rounded-xl border border-slate-800/70 bg-slate-950/60 text-left shadow-sm shadow-slate-900/30 transition hover:border-primary-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:mx-auto sm:max-w-3xl"
          >
            <div className="flex max-h-[70vh] w-full items-center justify-center bg-slate-900/80">
              <img
                src={previewSource}
                alt={attachment.file_name}
                loading="lazy"
                className="h-auto max-h-[70vh] w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
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
          className="flex w-full max-w-full items-center justify-between gap-4 rounded-lg border border-slate-800/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 transition hover:border-primary-400/60 hover:text-primary-100 sm:mx-auto sm:max-w-3xl"
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

  return (
    <main className="flex min-h-dvh flex-1 flex-col md:h-screen">
      <header className="flex items-center justify-between border-b border-slate-800/70 bg-slate-950/70 px-4 py-3 sm:px-5">
        <div className="flex flex-1 items-start gap-3">
          <button
            type="button"
            onClick={onOpenNavigation}
            disabled={!onOpenNavigation}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-slate-800/70 text-slate-300 transition hover:border-primary-400 hover:text-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-default disabled:opacity-60 md:hidden"
            aria-label="Open navigation menu"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="flex flex-1 flex-col">
            <p className="font-mono text-[11px] text-slate-500">
              bafa@chat:~/servers/{selectedServer?.id ?? 'workspace'}/{selectedChannel?.id ?? 'channel'}
            </p>
            <h1 className="mt-1 text-lg font-semibold text-white md:text-left">
              {selectedChannel ? `#${selectedChannel.name}` : 'Select a channel'}
            </h1>
            {selectedChannel?.description && (
              <p className="mt-1 text-xs text-slate-400 md:hidden">{selectedChannel.description}</p>
            )}
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
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
        {isDragActive && (
          <div className="pointer-events-none absolute inset-6 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary-300/60 bg-slate-950/70">
            <div className="rounded-2xl border border-primary-300/40 bg-slate-950/90 px-6 py-4 text-center shadow-lg shadow-primary-500/20">
              <p className="text-sm font-semibold text-primary-100">Drop files to share</p>
              <p className="mt-2 text-xs text-slate-300">We’ll upload them directly to this channel.</p>
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto" ref={messageListRef}>
            <div className="mx-auto w-full space-y-6 px-4 py-6" ref={messageListContentRef}>
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

              {selectedChannel && selectedChannel.type === 'audio' && (
                <div className="mx-auto flex w-full flex-col gap-6 rounded-3xl border border-emerald-500/40 bg-slate-950/75 px-6 py-8 text-emerald-100 shadow-xl shadow-emerald-500/10">
                  <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/80">Live conference</span>
                      <h3 className="mt-2 text-2xl font-semibold text-white">#{selectedChannel.name}</h3>
                      <p className="mt-1 text-sm text-emerald-200/80">See everyone in the room, share your camera, and collaborate in real time.</p>
                    </div>
                    <span className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-emerald-200">
                      {webrtcStatusLabel}
                    </span>
                  </header>

                  <div className="min-h-[320px] rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
                    {audioParticipants.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-emerald-200/70">
                        <IconVideo className="h-12 w-12 text-emerald-300" />
                        <p className="text-sm">You’re the first one here. When teammates join, they’ll appear in this stage.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {audioParticipants.map((participant) => {
                          const isSelf = currentUser?.id === participant.user_id;
                          const displayName =
                            participant.display_name && participant.display_name.trim().length > 0
                              ? participant.display_name
                              : `Member #${participant.user_id}`;
                          const initials =
                            displayName
                              .split(' ')
                              .filter(Boolean)
                              .map((word) => word[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase() || '??';
                          const mediaState = mergeMediaState(DEFAULT_MEDIA_STATE, participant.media_state);
                          const stream = isSelf ? localMediaStreamRef.current : remoteMediaStreams[participant.user_id];
                          const hasVideoTrack = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
                          const cameraActive = mediaState.camera === 'on' && Boolean(stream) && hasVideoTrack;
                          const micActive = mediaState.mic === 'on';

                          return (
                            <div
                              key={participant.user_id}
                              className="group relative aspect-video overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-lg shadow-emerald-500/10"
                            >
                              <video
                                ref={(node) => {
                                  if (isSelf) {
                                    if (node) {
                                      localPreviewRef.current = node;
                                      const activeStream = localMediaStreamRef.current;
                                      if (activeStream && node.srcObject !== activeStream) {
                                        node.srcObject = activeStream;
                                      }
                                      node.muted = true;
                                      node.playsInline = true;
                                    } else {
                                      localPreviewRef.current = null;
                                    }
                                  } else {
                                    if (!node) {
                                      remoteMediaElementsRef.current.delete(participant.user_id);
                                      return;
                                    }
                                    remoteMediaElementsRef.current.set(participant.user_id, node);
                                    const activeStream = remoteMediaStreams[participant.user_id];
                                    if (activeStream && node.srcObject !== activeStream) {
                                      node.srcObject = activeStream;
                                    }
                                    node.muted = false;
                                    node.playsInline = true;
                                  }
                                }}
                                autoPlay
                                muted={isSelf}
                                playsInline
                                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                                style={{ opacity: cameraActive ? 1 : 0.05 }}
                              />
                              <div
                                className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-center transition-opacity duration-300 ${
                                  cameraActive ? 'opacity-0 group-hover:opacity-10' : 'opacity-100'
                                }`}
                              >
                                <span className="text-4xl font-semibold text-emerald-200/80">{initials}</span>
                                <span className="mt-2 text-sm text-emerald-200/70">{displayName}</span>
                                {isSelf && <span className="mt-1 text-xs uppercase tracking-[0.3em] text-emerald-300/70">You</span>}
                              </div>
                              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-3">
                                <div>
                                  <p className="text-base font-semibold text-white">
                                    {displayName}{' '}
                                    {isSelf && <span className="ml-1 text-xs uppercase tracking-[0.3em] text-emerald-300/80">You</span>}
                                  </p>
                                  {participant.role && (
                                    <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">{participant.role}</p>
                                  )}
                                </div>
                                <span
                                  className={`rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.3em] ${
                                    micActive ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'
                                  }`}
                                >
                                  {micActive ? 'Speaking' : 'Muted'}
                                </span>
                              </div>
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-3 text-[11px] font-mono uppercase tracking-[0.3em]">
                                <span className={`flex items-center gap-2 ${micActive ? 'text-emerald-200' : 'text-red-300'}`}>
                                  {micActive ? <IconMic className="h-4 w-4" /> : <IconMicOff className="h-4 w-4" />}{' '}
                                  {micActive ? 'Mic on' : 'Mic off'}
                                </span>
                                <span className={`flex items-center gap-2 ${cameraActive ? 'text-emerald-200' : 'text-slate-300'}`}>
                                  {cameraActive ? <IconVideo className="h-4 w-4" /> : <IconVideoOff className="h-4 w-4" />}{' '}
                                  {cameraActive ? 'Cam on' : 'Cam off'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    {webrtcError && (
                      <div className="w-full max-w-2xl rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-100">
                        {webrtcError}
                      </div>
                    )}
                    {mediaPermissionError && (
                      <div className="w-full max-w-2xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100">
                        {mediaPermissionError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-4">
                      {showJoinAudioButton ? (
                        <button
                          type="button"
                          onClick={handleJoinAudioChannel}
                          disabled={joinAudioDisabled}
                          className="flex h-14 items-center gap-3 rounded-full bg-emerald-400 px-8 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
                        >
                          <IconVideo className="h-5 w-5" />
                          {joinAudioDisabled ? 'Joining…' : 'Join conference'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleMic();
                            }}
                            disabled={isJoiningWebRTC}
                            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition ${
                              localMediaState.mic === 'on'
                                ? 'border-emerald-400 bg-emerald-400/20 text-emerald-100'
                                : 'border-slate-800 bg-slate-900 text-red-200'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                            aria-label={localMediaState.mic === 'on' ? 'Mute microphone' : 'Unmute microphone'}
                          >
                            {localMediaState.mic === 'on' ? <IconMic className="h-5 w-5" /> : <IconMicOff className="h-5 w-5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleCamera();
                            }}
                            disabled={isJoiningWebRTC}
                            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition ${
                              localMediaState.camera === 'on'
                                ? 'border-emerald-400 bg-emerald-400/20 text-emerald-100'
                                : 'border-slate-800 bg-slate-900 text-slate-300'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                            aria-label={localMediaState.camera === 'on' ? 'Disable camera' : 'Enable camera'}
                          >
                            {localMediaState.camera === 'on' ? <IconVideo className="h-5 w-5" /> : <IconVideoOff className="h-5 w-5" />}
                          </button>
                          <button
                            type="button"
                            disabled
                            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-800 bg-slate-900 text-slate-500 opacity-60"
                            aria-label="Share screen (coming soon)"
                            title="Screen sharing coming soon"
                          >
                            <IconScreenShare className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleLeaveAudioChannel();
                            }}
                            disabled={isJoiningWebRTC}
                            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-red-500/60"
                            aria-label="Leave conference"
                          >
                            <IconPhone className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
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
                      <article key={group.key} className="group flex gap-3 rounded-lg px-3 py-2 transition hover:bg-slate-900/60">
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

      {selectedChannel && selectedChannel.type === 'text' && (
        <footer className="border-t border-slate-800/70 bg-slate-950/80 px-4 py-4">
          <form onSubmit={handleSendMessage} className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            <input ref={fileInputRef} type="file" multiple onChange={handleFileInputChange} className="hidden" />
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
                    <div key={upload.id} className="rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-slate-300">
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
      )}
    </main>
  );
};

export default ChatMainArea;
