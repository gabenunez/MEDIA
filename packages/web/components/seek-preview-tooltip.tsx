"use client";

import type { SeekThumbnailCue } from "@/lib/use-seek-thumbnails";
import { formatDuration } from "@/lib/utils";

interface SeekPreviewTooltipProps {
  percent: number;
  timeMs: number;
  chapterTitle?: string;
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
  chapterTitle,
  cue,
  spriteUrl,
  variant = "floating",
  maxThumbWidth = 224,
}: SeekPreviewTooltipProps) {
  const scale = cue ? Math.min(1, maxThumbWidth / cue.width) : 1;
  const displayWidth = cue ? Math.round(cue.width * scale) : 0;
  const previewBody =
    cue && spriteUrl ? (
      (() => {
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
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pb-1 pt-5">
              {chapterTitle && <span className="max-w-full truncate text-xs font-semibold text-white">{chapterTitle}</span>}
              <span className="font-mono text-xs font-medium tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {formatDuration(timeMs)}
              </span>
            </div>
          </div>
        );
      })()
    ) : (
      <div className="max-w-48 rounded-xl ring-1 ring-white/15 bg-black/90 px-2.5 py-1.5 text-center text-xs font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        {chapterTitle && <span className="block truncate font-semibold">{chapterTitle}</span>}
        <span className="font-mono tabular-nums">{formatDuration(timeMs)}</span>
      </div>
    );

  if (variant === "inline") {
    return (
      <div className="pointer-events-none flex w-full max-w-full justify-center overflow-hidden">
        {previewBody}
      </div>
    );
  }

  const position = Math.max(0, Math.min(100, percent));
  const floatingStyle = cue && spriteUrl
    ? {
        // Center on the seek point until the complete image hits a timeline edge.
        left: `clamp(0px, calc(${position}% - ${displayWidth / 2}px), calc(100% - ${displayWidth}px))`,
        width: displayWidth,
      }
    : {
        // Keep the variable-width timestamp and chapter label inside the track too.
        left: `${position}%`,
        transform: `translateX(-${position}%)`,
        width: "max-content",
      };
  return (
    <div
      className="pointer-events-none absolute bottom-full z-20 mb-2 max-w-full"
      style={floatingStyle}
    >
      {previewBody}
    </div>
  );
}
