"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangleIcon } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  attachedImages?: Record<string, string>; // fileId -> signed URL
}

/**
 * Pre-processes custom syntax before passing to ReactMarkdown.
 * Converts custom blocks to standard markdown that ReactMarkdown can handle.
 */
function preprocess(
  content: string,
  attachedImages: Record<string, string>
): string {
  let processed = content;

  // [image:filename.ext] → standard markdown image
  // Matches any filename including spaces, dots, parentheses, etc.
  processed = processed.replace(
    /\[image:([^\]]+)\]/g,
    (_match, fileName: string) => {
      const url = attachedImages[fileName];
      if (url) return `![${fileName}](${url})`;
      return `*[Image: ${fileName} — not found]*`;
    }
  );

  return processed;
}

/** Check if text contains [warn]...[/warn] blocks and split them for rendering */
function splitWarnings(text: string): Array<{ type: "md" | "warn"; content: string }> {
  const parts: Array<{ type: "md" | "warn"; content: string }> = [];
  const regex = /\[warn\]([\s\S]*?)\[\/warn\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "md", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "warn", content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "md", content: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "md", content: text }];
}

const components: Components = {
  code: ({ children, className, ...props }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-md bg-muted px-1.5 py-0.5 text-[0.85em] font-mono text-foreground before:content-none after:content-none"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="rounded-lg bg-muted/70 border p-4 overflow-x-auto text-sm font-mono"
      {...props}
    >
      {children}
    </pre>
  ),
  img: ({ src, alt, ...props }) => (
    <img
      src={src}
      alt={alt}
      className="rounded-lg border shadow-sm max-h-96 object-contain my-3"
      loading="lazy"
      {...props}
    />
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-medium" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-border px-3 py-2" {...props}>
      {children}
    </td>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-6 border-border" />,
};

function WarningBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 my-3 text-sm text-yellow-800 dark:text-yellow-300">
      <AlertTriangleIcon className="size-4 shrink-0 mt-0.5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function MarkdownRenderer({ content, attachedImages = {} }: MarkdownRendererProps) {
  const processed = preprocess(content, attachedImages);
  const parts = splitWarnings(processed);

  return (
    <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, i) =>
        part.type === "warn" ? (
          <WarningBlock key={i}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {part.content}
            </ReactMarkdown>
          </WarningBlock>
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
            {part.content}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}
