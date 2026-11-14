"use client";

import type { SeekThumbnailCue } from "@/lib/use-seek-thumbnails";
import { formatDuration } from "@/lib/utils";

interface SeekPreviewTooltipProps {
  percent: number;
  timeMs: number;
  cue: SeekThumbnailCue | null;
  spriteUrl: string | null;
  /** inline = centered in a dock slot; floating = above a timeline (default) */
  variant?: "inline" | "floating";
  /** Cap thumbnail width in px (default 224; TV passes a larger value). */
  maxThumbWidth?: number;
}

export function SeekPreviewTooltip({
  percent,
  timeMs,
  cue,
  spriteUrl,
  variant = "floating",
  maxThumbWidth = 224,
}: SeekPreviewTooltipProps) {
  const previewBody =
    cue && spriteUrl ? (
      (() => {
        const scale = Math.min(1, maxThumbWidth / cue.width);
        const displayWidth = Math.round(cue.width * scale);
        const displayHeight = Math.round(cue.height * scale);

        return (
          <div
            className="relative max-w-full overflow-hidden rounded-xl ring-1 ring-white/15 bg-black shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            style={{ width: displayWidth, maxWidth: "100%" }}
          >
            <div
              className="overflow-hidden"
              style={{ width: displayWidth, height: displayHeight, maxWidth: "100%" }}
            >
              <div
                style={{
                  width: cue.width,
                  height: cue.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  backgroundImage: `url(${spriteUrl})`,
                  backgroundPosition: `-${cue.x}px -${cue.y}px`,
                  backgroundRepeat: "no-repeat",
                }}
              />
            </div>
            {/* Gradient scrim keeps the timestamp legible over bright frames. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pb-1 pt-5">
              <span className="font-mono text-xs font-medium tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {formatDuration(timeMs)}
              </span>
            </div>
          </div>
        );
      })()
    ) : (
      <div className="rounded-xl ring-1 ring-white/15 bg-black/90 px-2.5 py-1.5 font-mono text-xs font-medium tabular-nums text-white shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        {formatDuration(timeMs)}
      </div>
    );

  if (variant === "inline") {
    return (
      <div className="pointer-events-none flex w-full max-w-full justify-center overflow-hidden">
        {previewBody}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2"
      style={{ left: `${percent}%` }}
    >
      {previewBody}
    </div>
  );
}
