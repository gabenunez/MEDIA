"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";

export function TvWatchedButton({
  mediaId,
  initialWatched = false,
  className,
  onChange,
}: {
  mediaId: number;
  initialWatched?: boolean;
  className?: string;
  onChange?: (watched: boolean) => void;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    const next = !watched;
    setLoading(true);
    try {
      await api.setMediaWatched(mediaId, next);
      setWatched(next);
      onChange?.(next);
    } catch (err) {
      console.warn("Failed to update watched state", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TvFocusButton
      type="button"
      selected={watched}
      disabled={loading}
      onClick={() => void toggle()}
      aria-pressed={watched}
      aria-label={watched ? "Mark as unwatched" : "Mark as already watched"}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-semibold",
        watched && "text-accent",
        className,
      )}
    >
      <CheckCircle2 className={cn("h-5 w-5", watched && "fill-current text-background")} />
      {watched ? "Watched" : "Already watched"}
    </TvFocusButton>
  );
}
