"use client";

import ReactMarkdown from "react-markdown";
import { previewReleaseNotes } from "@/lib/update-utils";
import { cn } from "@/lib/utils";

interface ReleaseNotesProps {
  notes: string | null;
  maxLines?: number;
  className?: string;
}

export function ReleaseNotes({ notes, maxLines, className }: ReleaseNotesProps) {
  const content = previewReleaseNotes(notes, maxLines);
  if (!content) return null;

  return (
    <div
      className={cn(
        "rounded-md bg-muted/50 p-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        components={{
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-3 text-xs font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
