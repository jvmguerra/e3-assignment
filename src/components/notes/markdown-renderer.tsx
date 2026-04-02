"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { AlertTriangleIcon } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  attachedImages?: Record<string, string>; // fileId -> signed URL
}

/**
 * Pre-processes custom syntax before passing to ReactMarkdown:
 * - [warn]text[/warn] → <div class="warning-block">text</div>
 * - [image:fileId] → rendered as an inline image if URL is available
 */
function preprocess(
  content: string,
  attachedImages: Record<string, string>
): string {
  let processed = content;

  // [warn]...[/warn] → HTML warning block
  processed = processed.replace(
    /\[warn\]([\s\S]*?)\[\/warn\]/g,
    '<div class="custom-warning">$1</div>'
  );

  // [image:fileId] → <img> tag with signed URL, or placeholder
  processed = processed.replace(
    /\[image:([a-f0-9-]+)\]/g,
    (_match, fileId: string) => {
      const url = attachedImages[fileId];
      if (url) {
        return `<img src="${url}" alt="Attached image" class="custom-image" />`;
      }
      return `<span class="custom-image-missing">Image not found</span>`;
    }
  );

  return processed;
}

export function MarkdownRenderer({ content, attachedImages = {} }: MarkdownRendererProps) {
  const processed = preprocess(content, attachedImages);

  return (
    <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Custom rendering for our warning blocks
          div: ({ className, children, ...props }) => {
            if (className === "custom-warning") {
              return (
                <div className="not-prose flex items-start gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 my-3 text-sm text-yellow-800 dark:text-yellow-300">
                  <AlertTriangleIcon className="size-4 shrink-0 mt-0.5" />
                  <div>{children}</div>
                </div>
              );
            }
            return <div className={className} {...props}>{children}</div>;
          },
          // Style inline code
          code: ({ children, className, ...props }) => {
            // Check if this is a code block (has language class) vs inline code
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <code className={`${className ?? ""} block`} {...props}>
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
          // Style code blocks
          pre: ({ children, ...props }) => (
            <pre
              className="rounded-lg bg-muted/70 border p-4 overflow-x-auto text-sm font-mono"
              {...props}
            >
              {children}
            </pre>
          ),
          // Style images (including our custom [image:id] ones)
          img: ({ src, alt, className, ...props }) => {
            if (className === "custom-image") {
              return (
                <img
                  src={src}
                  alt={alt}
                  className="not-prose rounded-lg border shadow-sm max-h-96 object-contain my-3"
                  loading="lazy"
                  {...props}
                />
              );
            }
            return (
              <img
                src={src}
                alt={alt}
                className="rounded-lg max-h-96 object-contain"
                loading="lazy"
                {...props}
              />
            );
          },
          // Style missing image placeholders
          span: ({ className, children, ...props }) => {
            if (className === "custom-image-missing") {
              return (
                <span className="not-prose inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground border border-dashed">
                  {children}
                </span>
              );
            }
            return <span className={className} {...props}>{children}</span>;
          },
          // Style tables (GFM)
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-3">
              <table className="not-prose w-full text-sm border-collapse" {...props}>
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
          // Style blockquotes
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Style task lists (GFM)
          li: ({ children, className, ...props }) => (
            <li className={className ?? ""} {...props}>
              {children}
            </li>
          ),
          // Style links
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
          // Horizontal rules
          hr: () => <hr className="my-6 border-border" />,
        }}
      />
    </div>
  );
}
