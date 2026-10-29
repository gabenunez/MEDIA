"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";
import {
  formatSubtitleSync,
  readSubtitleSync,
  stepSubtitleSync,
  writeSubtitleSync,
} from "@/lib/subtitle-sync";

export function useSubtitleSync(subtitleId: number | null) {
  const [offsetSeconds, setOffsetSeconds] = useState(0);

  useEffect(() => {
    setOffsetSeconds(readSubtitleSync(subtitleId));
  }, [subtitleId]);

  const adjust = (direction: -1 | 1) => {
    if (subtitleId == null) return;
    setOffsetSeconds((current) => {
      const next = stepSubtitleSync(current, direction);
      writeSubtitleSync(subtitleId, next);
      return next;
    });
  };

  const reset = () => {
    if (subtitleId == null) return;
    writeSubtitleSync(subtitleId, 0);
    setOffsetSeconds(0);
  };

  return { offsetSeconds, adjust, reset, enabled: subtitleId != null };
}

function SyncButton({
  tv,
  label,
  onClick,
  disabled,
  children,
}: {
  tv: boolean;
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  if (tv) {
    return (
      <TvFocusButton
        variant="default"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
      >
        {children}
      </TvFocusButton>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function SubtitleSyncControls({
  tv = false,
  enabled,
  offsetSeconds,
  onAdjust,
  onReset,
}: {
  tv?: boolean;
  enabled: boolean;
  offsetSeconds: number;
  onAdjust: (direction: -1 | 1) => void;
  onReset: () => void;
}) {
  const label = formatSubtitleSync(offsetSeconds);
  const shifted = offsetSeconds !== 0;

  return (
    <div
      data-tv-row=""
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5",
        tv ? "border-2 border-white/10 bg-white/[0.04]" : "mx-1 border border-white/10 bg-white/[0.03]",
        !enabled && "opacity-45",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="min-w-0">
        <p className={cn("font-medium text-white", tv ? "text-sm" : "text-xs")}>Timing</p>
        <p className={cn("text-white/45", tv ? "text-xs" : "text-[10px] leading-4")}>
          {shifted ? (offsetSeconds > 0 ? "Later" : "Earlier") : "In sync"}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <SyncButton
          tv={tv}
          label="Show subtitles 0.1 seconds earlier"
          disabled={!enabled}
          onClick={() => onAdjust(-1)}
        >
          <Minus className={tv ? "h-5 w-5" : "h-3.5 w-3.5"} />
        </SyncButton>
        {shifted ? (
          tv ? (
            <TvFocusButton
              variant="default"
              disabled={!enabled}
              onClick={onReset}
              aria-label="Reset subtitle timing"
              className="flex h-11 min-w-[4.75rem] items-center justify-center rounded-lg px-2 text-base font-medium tabular-nums text-white"
            >
              {label}
            </TvFocusButton>
          ) : (
            <button
              type="button"
              disabled={!enabled}
              onClick={onReset}
              aria-label="Reset subtitle timing"
              className="h-8 min-w-[4.25rem] rounded-md px-1 text-center text-sm font-medium tabular-nums text-white hover:bg-white/10 disabled:opacity-40"
            >
              {label}
            </button>
          )
        ) : (
          <span
            className={cn(
              "min-w-[4.25rem] text-center font-medium tabular-nums text-white",
              tv ? "text-base" : "text-sm",
            )}
            aria-label="Subtitle timing"
          >
            {label}
          </span>
        )}
        <SyncButton
          tv={tv}
          label="Show subtitles 0.1 seconds later"
          disabled={!enabled}
          onClick={() => onAdjust(1)}
        >
          <Plus className={tv ? "h-5 w-5" : "h-3.5 w-3.5"} />
        </SyncButton>
      </div>
    </div>
  );
}
