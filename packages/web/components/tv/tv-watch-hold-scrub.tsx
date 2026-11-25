"use client";

import { FastForward, Rewind } from "lucide-react";
import { SeekPreviewTooltip } from "@/components/seek-preview-tooltip";
import type { SeekThumbnailCue } from "@/lib/use-seek-thumbnails";
import type { HoldScrubPreview } from "@/lib/use-watch-hold-scrub";
import { formatDuration } from "@/lib/utils";

export function TvWatchHoldScrub({
  preview,
  durationSeconds,
  cue,
  spriteUrl,
  maxThumbWidth,
}: {
  preview: HoldScrubPreview;
  durationSeconds: number;
  cue: SeekThumbnailCue | null;
  spriteUrl: string | null;
  maxThumbWidth: number;
}) {
  const targetPercent = (preview.targetSeconds / durationSeconds) * 100;
  const originPercent = (preview.originSeconds / durationSeconds) * 100;
  const back = preview.key === "ArrowLeft";
  const Icon = back ? Rewind : FastForward;
  const timeMs = preview.targetSeconds * 1000;

  return (
    <section
      data-tv-watch-hold-scrub=""
      aria-label="Seek preview"
      className="pointer-events-none absolute inset-x-0 bottom-[max(2rem,7vh)] z-30 px-8"
    >
      <SeekPreviewTooltip
        percent={targetPercent}
        timeMs={timeMs}
        cue={cue}
        spriteUrl={spriteUrl}
        maxThumbWidth={maxThumbWidth}
        variant="inline"
      />
      <div className="mx-auto mt-3 max-w-2xl rounded-2xl border border-white/15 bg-[#0c1517]/95 px-5 py-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-5 w-5 text-primary" fill="currentColor" aria-hidden="true" />
            {back ? "Rewind" : "Fast forward"}
          </div>
          <div className="whitespace-nowrap font-mono text-sm tabular-nums">
            {formatDuration(timeMs)} <span className="text-white/65">/ {formatDuration(durationSeconds * 1000)}</span>
          </div>
        </div>
        <div className="relative my-3 h-1.5 rounded-full bg-white/20" aria-hidden="true">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${originPercent}%` }} />
          <div
            className="absolute inset-y-0 rounded-full bg-primary/65"
            style={{ left: `${Math.min(originPercent, targetPercent)}%`, width: `${Math.abs(targetPercent - originPercent)}%` }}
          />
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary"
            style={{ left: `${targetPercent}%` }}
          />
        </div>
        <p className="text-xs font-medium text-white/75">
          Release to seek <span className="mx-1 text-white/55">·</span> Back to cancel
        </p>
      </div>
    </section>
  );
}
