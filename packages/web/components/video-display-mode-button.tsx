"use client";

import { Expand, Proportions, StretchHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { WatchControlHint } from "@/components/watch-control-hint";
import { cn } from "@/lib/utils";
import {
  type VideoDisplayMode,
  videoDisplayModeHint,
  videoDisplayModeLabel,
} from "@/lib/video-display-mode";

function DisplayModeIcon({
  mode,
  className,
  size = 24,
}: {
  mode: VideoDisplayMode;
  className?: string;
  size?: number;
}) {
  const props = {
    size,
    strokeWidth: 2 as const,
    absoluteStrokeWidth: true as const,
    className,
    "aria-hidden": true as const,
  };
  switch (mode) {
    case "fill":
      return <Expand {...props} />;
    case "stretch":
      return <StretchHorizontal {...props} />;
    default:
      return <Proportions {...props} />;
  }
}

interface VideoDisplayModeButtonProps {
  mode: VideoDisplayMode;
  onCycle: () => void;
  variant?: "desktop" | "tv";
  className?: string;
}

export function VideoDisplayModeButton({
  mode,
  onCycle,
  variant = "desktop",
  className,
}: VideoDisplayModeButtonProps) {
  const label = videoDisplayModeLabel(mode);
  const hint = videoDisplayModeHint(mode);

  if (variant === "tv") {
    return (
      <TvFocusButton
        variant="watch"
        onClick={onCycle}
        aria-label={`Display: ${label}. ${hint}`}
        title={hint}
        className={className}
      >
        <span className="watch-control-icon">
          <DisplayModeIcon mode={mode} size={24} />
        </span>
      </TvFocusButton>
    );
  }

  return (
    <WatchControlHint label={hint}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("watch-control-btn", className)}
        onClick={onCycle}
        aria-label={`Display: ${label}. ${hint}`}
      >
        <DisplayModeIcon mode={mode} size={16} />
      </Button>
    </WatchControlHint>
  );
}
