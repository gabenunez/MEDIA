"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";

interface TvFavoriteButtonProps {
  mediaId: number;
  initialFavorite?: boolean;
  className?: string;
}

export function TvFavoriteButton({
  mediaId,
  initialFavorite = false,
  className,
}: TvFavoriteButtonProps) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;

    const next = !favorite;
    setLoading(true);

    try {
      if (next) {
        await api.addFavorite(mediaId);
      } else {
        await api.removeFavorite(mediaId);
      }
      setFavorite(next);
    } catch (err) {
      console.warn("Failed to update favorite", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TvFocusButton
      type="button"
      disabled={loading}
      onClick={() => void toggle()}
      aria-pressed={favorite}
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "inline-flex items-center gap-3 rounded-xl border px-6 py-3 text-lg font-semibold transition-colors",
        favorite
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-border bg-muted/60 text-foreground hover:bg-muted",
        className,
      )}
    >
      <Heart className={cn("h-5 w-5", favorite && "fill-current")} />
      {favorite ? "Favorited" : "Favorite"}
    </TvFocusButton>
  );
}
