"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";
import {
  describeSubtitleSync,
  readSubtitleSync,
  stepSubtitleSync,
  SUBTITLE_SYNC_LIMIT_SECONDS,
  writeSubtitleSync,
} from "@/lib/subtitle-sync";
import { TV_SUBTITLE_SYNC_STEP_EVENT } from "@/lib/tv-subtitle-sync-nav";

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

function stopMenuClick(event: { stopPropagation: () => void }) {
  event.stopPropagation();
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
  const phrase = describeSubtitleSync(offsetSeconds);
  const shifted = offsetSeconds !== 0;
  const atEarlierLimit = offsetSeconds <= -SUBTITLE_SYNC_LIMIT_SECONDS;
  const atLaterLimit = offsetSeconds >= SUBTITLE_SYNC_LIMIT_SECONDS;
  const onAdjustRef = useRef(onAdjust);
  onAdjustRef.current = onAdjust;
  const rowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!tv || !row) return;
    const onStep = (event: Event) => {
      const direction = (event as CustomEvent<number>).detail;
      if (direction === -1 || direction === 1) onAdjustRef.current(direction);
    };
    row.addEventListener(TV_SUBTITLE_SYNC_STEP_EVENT, onStep);
    return () => row.removeEventListener(TV_SUBTITLE_SYNC_STEP_EVENT, onStep);
  }, [tv, enabled]);

  if (!enabled) return null;

  if (tv) {
    return (
      <TvFocusButton
        ref={rowRef}
        variant="default"
        data-tv-subtitle-sync=""
        aria-label={
          shifted
            ? `Subtitles ${phrase}. Press left to show them earlier, right to show them later, and OK to reset.`
            : `Subtitles on time. Press left to show them earlier and right to show them later.`
        }
        onClick={(event) => {
          stopMenuClick(event);
          if (shifted) onReset();
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
      >
        <DirectionLabel direction="earlier" muted={atEarlierLimit} />
        <span className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className="text-base font-medium leading-tight text-white">{phrase}</span>
          <span className="mt-0.5 text-xs text-white/55">
            {shifted ? "OK resets" : "Left earlier, right later"}
          </span>
        </span>
        <DirectionLabel direction="later" muted={atLaterLimit} />
      </TvFocusButton>
    );
  }

  return (
    <div className="px-2 py-1.5" onClick={stopMenuClick}>
      <p className="text-center text-sm font-medium leading-tight text-white">{phrase}</p>
      {shifted ? (
        <button
          type="button"
          onClick={onReset}
          className="mx-auto mt-0.5 block text-[11px] leading-4 text-white/55 hover:text-white"
        >
          Reset
        </button>
      ) : (
        <p className="mt-0.5 text-center text-[11px] leading-4 text-white/40">0.1 seconds at a time</p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <StepButton
          label="Show subtitles 0.1 seconds earlier"
          disabled={atEarlierLimit}
          onClick={() => onAdjust(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Earlier
        </StepButton>
        <StepButton
          label="Show subtitles 0.1 seconds later"
          disabled={atLaterLimit}
          onClick={() => onAdjust(1)}
        >
          Later
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </StepButton>
      </div>
    </div>
  );
}

function DirectionLabel({
  direction,
  muted,
}: {
  direction: "earlier" | "later";
  muted: boolean;
}) {
  const Icon = direction === "earlier" ? ChevronLeft : ChevronRight;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-0.5 text-sm text-white/80",
        muted && "opacity-35",
      )}
    >
      {direction === "earlier" ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {direction === "earlier" ? "Earlier" : "Later"}
      {direction === "later" ? <Icon className="h-4 w-4" aria-hidden /> : null}
    </span>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-md border border-white/15 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
