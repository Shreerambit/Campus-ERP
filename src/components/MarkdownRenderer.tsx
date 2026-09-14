import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Pre-clean raw HTML breaks like <br> or <br/> into standard newlines for markdown parser
  const cleanContent = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n');

  return (
    <div className="erp-markdown text-[14px] leading-relaxed break-words space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-black text-gray-900 dark:text-white mt-3 mb-1.5 border-b border-black/5 dark:border-white/10 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mt-2.5 mb-1 flex items-center gap-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 mt-2 mb-0.5">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-1 text-gray-800 dark:text-gray-100 leading-normal">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-4 space-y-1 my-1.5 text-gray-800 dark:text-gray-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5 text-gray-800 dark:text-gray-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-snug">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-gray-950 dark:text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-700 dark:text-gray-300">
              {children}
            </em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-ios-blue/70 pl-3 py-1 my-2 bg-ios-blue/5 dark:bg-ios-blue/10 rounded-r-xl text-gray-800 dark:text-gray-200 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-black/10 dark:border-white/10 shadow-sm">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-black/5 dark:bg-white/10 text-gray-900 dark:text-white font-bold border-b border-black/10 dark:border-white/10">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-gray-800 dark:text-gray-200 align-top">
              {children}
            </td>
          ),
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="bg-black/10 dark:bg-white/10 text-ios-blue dark:text-sky-300 px-1.5 py-0.5 rounded-md font-mono text-[12px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="overflow-x-auto p-3 my-2 bg-gray-900 text-gray-100 rounded-xl text-xs font-mono border border-gray-800 shadow-inner">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          hr: () => (
            <hr className="my-3 border-black/10 dark:border-white/10" />
          ),
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
}
