"use client";

import { FastForward, Rewind } from "lucide-react";
import type { WatchSkipFeedback } from "@/lib/tv-watch-player";

export function WatchSkipFeedbackBadge({
  direction,
  seconds,
  nonce,
}: WatchSkipFeedback & {
  nonce: number;
}) {
  const back = direction === "back";
  const Icon = back ? Rewind : FastForward;
  const amount = seconds < 1 ? "<1" : Math.round(seconds).toString();
  const spokenAmount = seconds < 1
    ? "less than one second"
    : `${amount} ${amount === "1" ? "second" : "seconds"}`;

  return (
    <div
      className={`pointer-events-none absolute inset-y-0 z-30 flex items-center ${
        back ? "watch-skip-overlay--back" : "watch-skip-overlay--forward"
      }`}
      role="status"
      aria-atomic="true"
    >
      <span className="sr-only">Skipped {direction} {spokenAmount}</span>
      <div
        key={direction}
        className="watch-skip-feedback"
        data-tv-watch-skip-feedback=""
        aria-hidden="true"
      >
        <span className="watch-skip-feedback-icon">
          <span key={nonce} className="watch-skip-feedback-glyph">
            <Icon fill="currentColor" strokeWidth={1.5} />
          </span>
        </span>
        <span className="watch-skip-feedback-copy">
          <span className="watch-skip-feedback-label">{back ? "Rewind" : "Forward"}</span>
          <span className="watch-skip-feedback-value tabular-nums">
            {back ? "−" : "+"}{amount}<span className="watch-skip-feedback-unit">s</span>
          </span>
        </span>
      </div>
    </div>
  );
}
