"use client";

import { cn } from "@/lib/utils";

export function SubtitleLoadNotice({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-red-400/30 bg-black/90 px-4 py-3 text-sm text-red-100 shadow-lg",
        className,
      )}
    >
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      {onDismiss && (
        <button
          type="button"
          className="shrink-0 rounded px-2 py-0.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
