import React from 'react';
import type { ChatController } from '../../hooks/useChatController';
import VideoAttachmentPlayer from './VideoAttachmentPlayer';

const AttachmentPreviewDialog: React.FC<{ controller: ChatController }> = ({ controller }) => {
  const {
    state: { previewAttachment },
    derived: { previewAttachmentIsVideo, previewAttachmentIsImage },
    actions: { handleClosePreview },
    utils: { formatFileSize },
  } = controller;

  if (!previewAttachment) {
    return null;
  }

  return (
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
          aria-label="Close attachment preview"
        >
          X
        </button>

        <div className="flex items-center justify-center bg-slate-950 p-4">
          {previewAttachmentIsVideo ? (
            <div className="w-full max-w-4xl">
              <VideoAttachmentPlayer attachment={previewAttachment} formatFileSize={formatFileSize} />
            </div>
          ) : (
            <img
              src={previewAttachment.url}
              alt={previewAttachment.file_name}
              className="max-h-[80vh] w-full object-contain"
            />
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-950/95 px-6 py-4 text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{previewAttachment.file_name}</p>
              <p className="text-xs text-slate-400">
                {(previewAttachment.content_type || 'image')} · {formatFileSize(previewAttachment.file_size)}
              </p>
            </div>
            {(previewAttachmentIsImage || previewAttachmentIsVideo) && (
              <button
                type="button"
                onClick={() => window.open(previewAttachment.url, '_blank', 'noopener,noreferrer')}
                className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                {previewAttachmentIsVideo ? 'Open Original' : 'View Original'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttachmentPreviewDialog;
