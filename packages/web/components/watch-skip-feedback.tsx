"use client";

import { SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WatchSkipFeedback } from "@/lib/tv-watch-player";

export function WatchSkipFeedbackBadge({
  direction,
  seconds,
  nonce,
  className,
}: WatchSkipFeedback & {
  nonce: number;
  className?: string;
}) {
  const Icon = direction === "back" ? SkipBack : SkipForward;
  const label =
    direction === "back"
      ? `Skipped back ${seconds} seconds`
      : `Skipped forward ${seconds} seconds`;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 z-30 flex items-center px-8",
        direction === "back" ? "left-0" : "right-0",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        key={nonce}
        className={cn(
          "watch-skip-feedback",
          direction === "back" && "watch-skip-feedback--back",
          direction === "forward" && "watch-skip-feedback--forward",
        )}
        data-tv-watch-skip-feedback=""
      >
        <span className="watch-skip-feedback-icon" aria-hidden>
          <Icon size={28} strokeWidth={2.25} absoluteStrokeWidth />
        </span>
        <span className="watch-skip-feedback-copy">
          <span className="watch-skip-feedback-value tabular-nums">{seconds}</span>
          <span className="watch-skip-feedback-unit">sec</span>
        </span>
      </div>
    </div>
  );
}
