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
        "pointer-events-none absolute inset-y-0 z-30 flex items-center",
        direction === "back" ? "left-10" : "right-10",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div key={nonce} className="watch-skip-feedback" data-tv-watch-skip-feedback="">
        <Icon size={40} strokeWidth={2} absoluteStrokeWidth aria-hidden />
        <span className="mt-1 text-xl font-semibold tabular-nums">{seconds}</span>
      </div>
    </div>
  );
}
