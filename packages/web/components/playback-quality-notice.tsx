"use client";

import { cn } from "@/lib/utils";

export function PlaybackQualityNotice({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("watch-status-chip pointer-events-none text-sm leading-snug", className)}
    >
      {message}
    </div>
  );
}
