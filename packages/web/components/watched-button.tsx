"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WatchedButton({
  mediaId,
  initialWatched = false,
  size = "default",
  onChange,
}: {
  mediaId: number;
  initialWatched?: boolean;
  size?: "default" | "sm" | "lg";
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
    <Button
      type="button"
      size={size}
      variant={watched ? "default" : "outline"}
      disabled={loading}
      onClick={() => void toggle()}
      aria-pressed={watched}
      aria-label={watched ? "Mark as unwatched" : "Mark as already watched"}
      className={cn(
        watched && "bg-accent text-accent-foreground hover:bg-accent/90",
      )}
    >
      <CheckCircle2 className="h-4 w-4" />
      {watched ? "Watched" : "Already watched"}
    </Button>
  );
}
