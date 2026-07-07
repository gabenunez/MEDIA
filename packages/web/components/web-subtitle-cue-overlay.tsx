"use client";

import { findActiveCueTexts, parseWebVttCues } from "@media-app/shared";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { useSubtitleStyles } from "@/components/subtitle-style-settings";
import { playbackSubtitleAppearance } from "@/lib/subtitle-styles";
import { cn } from "@/lib/utils";

export function WebSubtitleCueOverlay({
  videoRef,
  vtt,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  vtt: string | null;
  className?: string;
}) {
  const { styles } = useSubtitleStyles();
  const [lines, setLines] = useState<string[]>([]);
  const cues = useMemo(() => (vtt ? parseWebVttCues(vtt) : []), [vtt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || cues.length === 0) {
      setLines([]);
      return;
    }

    const update = () => {
      setLines(findActiveCueTexts(cues, video.currentTime));
    };

    video.addEventListener("timeupdate", update);
    video.addEventListener("seeking", update);
    video.addEventListener("seeked", update);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("play", update);
    update();

    return () => {
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("seeking", update);
      video.removeEventListener("seeked", update);
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("play", update);
    };
  }, [videoRef, cues]);

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
