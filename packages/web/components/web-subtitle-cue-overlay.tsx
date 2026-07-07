"use client";

import { useEffect, useState, type RefObject } from "react";
import { useSubtitleStyles } from "@/components/subtitle-style-settings";
import { playbackSubtitleAppearance } from "@/lib/subtitle-styles";
import { cn } from "@/lib/utils";

function readActiveCueLines(video: HTMLVideoElement): string[] {
  const track = Array.from(video.textTracks).find(
    (entry) => entry.kind === "subtitles" && entry.mode !== "disabled",
  );
  if (!track?.activeCues?.length) return [];

  const lines: string[] = [];
  for (const cue of Array.from(track.activeCues)) {
    if (cue instanceof VTTCue) {
      const text = cue.text.trim();
      if (text) lines.push(text);
    }
  }
  return lines;
}

export function WebSubtitleCueOverlay({
  videoRef,
  trackKey,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Bumps listeners when the attached subtitle track or stream changes. */
  trackKey: string | number;
  className?: string;
}) {
  const { styles } = useSubtitleStyles();
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const cueListeners = new Map<TextTrack, () => void>();

    const update = () => {
      setLines(readActiveCueLines(video));
    };

    const bindTrack = (track: TextTrack) => {
      if (track.kind !== "subtitles" || cueListeners.has(track)) return;
      const onCueChange = () => update();
      cueListeners.set(track, onCueChange);
      track.addEventListener("cuechange", onCueChange);
    };

    for (const track of Array.from(video.textTracks)) {
      bindTrack(track);
    }

    const onAddTrack = (event: TrackEvent) => {
      if (event.track) bindTrack(event.track);
      update();
    };

    video.textTracks.addEventListener("addtrack", onAddTrack);
    video.textTracks.addEventListener("change", update);
    update();

    return () => {
      video.textTracks.removeEventListener("addtrack", onAddTrack);
      video.textTracks.removeEventListener("change", update);
      for (const [track, onCueChange] of cueListeners) {
        track.removeEventListener("cuechange", onCueChange);
      }
      cueListeners.clear();
    };
  }, [videoRef, trackKey]);

  if (lines.length === 0) return null;

  const appearance = playbackSubtitleAppearance(styles);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-20 z-[25] flex justify-center px-6 sm:bottom-24 sm:px-10",
        className,
      )}
      role="region"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Subtitles"
    >
      <div
        className="max-w-4xl text-center text-balance whitespace-pre-wrap"
        style={{
          color: appearance.color,
          backgroundColor: appearance.backgroundColor,
          fontSize: appearance.fontSize,
          fontFamily: appearance.fontFamily,
          textShadow: appearance.textShadow,
          lineHeight: 1.35,
          padding: appearance.backgroundColor === "transparent" ? undefined : "0.2em 0.45em",
          borderRadius: appearance.backgroundColor === "transparent" ? undefined : "0.2em",
        }}
      >
        {lines.join("\n")}
      </div>
    </div>
  );
}
