import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    <blockquote {...props} className="border-l-2 border-primary-400/60 pl-3 text-sm italic text-primary-100/80">
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

type MarkdownMessageProps = {
  content: string;
};

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => (
  <div className="space-y-2 text-sm leading-relaxed text-slate-200">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
      {content}
    </ReactMarkdown>
  </div>
);

export default MarkdownMessage;
