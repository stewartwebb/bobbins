import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { coldarkDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { CodeComponent } from 'react-markdown/lib/ast-to-react';
import 'katex/dist/katex.min.css';

const baseTextClass = 'text-sm leading-relaxed text-slate-200';

const CodeBlock: CodeComponent = ({ inline, className, children, ...props }) => {
  const content = String(children).replace(/\n$/, '');

  if (inline) {
    const combinedClassName = ['rounded bg-slate-900/80 px-1 py-[1px] font-mono text-[13px] text-primary-200', className]
      .filter(Boolean)
      .join(' ');

    return (
      <code className={combinedClassName} {...props}>
        {content}
      </code>
    );
  }

  const match = /language-(\w+)/.exec(className || '');
  const language = match?.[1];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800/70">
      <SyntaxHighlighter
        language={language}
        PreTag="div"
        style={coldarkDark}
        customStyle={{ margin: 0, background: 'rgba(2,6,23,0.9)', fontSize: '0.8125rem', lineHeight: '1.5' }}
        wrapLines
        showLineNumbers
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
};

const markdownComponents: Components = {
  p: ({ children, className, ...props }: any) => {
    const combinedClassName = [baseTextClass, className].filter(Boolean).join(' ');

    return (
      <p {...props} className={combinedClassName}>
        {children}
      </p>
    );
  },
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
  strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
  em: ({ children }) => <em className="text-primary-100/80">{children}</em>,
  del: ({ children }) => <del className="text-slate-400 line-through">{children}</del>,
  code: CodeBlock,
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="border-l-2 border-primary-400/60 pl-3 text-sm italic text-primary-100/80"
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-slate-700/80" />,
  h1: ({ children }) => <h1 className="text-2xl font-semibold text-slate-100">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-100">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-100">{children}</h3>,
  h4: ({ children }) => <h4 className="text-base font-semibold text-slate-100">{children}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-semibold text-slate-100">{children}</h5>,
  h6: ({ children }) => <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{children}</h6>,
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
  li: ({ children, checked, ...props }: any) => {
    if (typeof checked === 'boolean') {
      return (
        <li {...props} className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            readOnly
            checked={checked}
            className="mt-[3px] h-4 w-4 cursor-default rounded border-slate-600 bg-slate-900 text-primary-400"
          />
          <span className="flex-1">{children}</span>
        </li>
      );
    }

    return (
      <li {...props} className="text-sm text-slate-200">
        {children}
      </li>
    );
  },
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} className="w-full table-auto border-collapse text-sm text-slate-200">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead {...props} className="bg-slate-900/60 text-left">
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody {...props} className="divide-y divide-slate-800/70">
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr {...props} className="border-b border-slate-800/60 last:border-0">
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th {...props} className="px-3 py-2 font-semibold text-slate-100">
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="px-3 py-2 align-top">
      {children}
    </td>
  ),
  img: ({ alt, ...props }: any) => (
    <img
      {...props}
      alt={alt}
      className="max-h-96 w-full rounded-lg border border-slate-800/70 object-contain"
    />
  ),
  sup: ({ children }) => <sup className="text-xs text-primary-200">{children}</sup>,
};

type MarkdownMessageProps = {
  content: string;
};

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => (
  <div className="space-y-2 text-sm leading-relaxed text-slate-200">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkEmoji, remarkBreaks]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={markdownComponents}
      skipHtml
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default MarkdownMessage;
