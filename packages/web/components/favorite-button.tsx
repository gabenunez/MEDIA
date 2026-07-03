"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  mediaId: number;
  initialFavorite?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost";
  className?: string;
  onChange?: (favorite: boolean) => void;
}

export function FavoriteButton({
  mediaId,
  initialFavorite = false,
  size = "default",
  variant = "outline",
  className,
  onChange,
}: FavoriteButtonProps) {
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
      onChange?.(next);
    } catch (err) {
      console.warn("Failed to update favorite", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={loading}
      onClick={() => void toggle()}
      aria-pressed={favorite}
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        favorite && "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15",
        className,
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4",
          size === "lg" && "h-5 w-5",
          favorite && "fill-current",
        )}
      />
      {size !== "icon" && (favorite ? "Favorited" : "Favorite")}
    </Button>
  );
}
