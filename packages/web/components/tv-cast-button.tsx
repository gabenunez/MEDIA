"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export interface TvCastPayload {
  fileId: number;
  type: "movie" | "episode";
  title?: string;
  posterPath?: string | null;
  mediaId?: number | null;
  startTimeMs?: number;
}

interface TvCastButtonProps {
  disabled?: boolean;
  className?: string;
  onCast: () => Promise<TvCastPayload>;
}

export function TvCastButton({ disabled, className, onCast }: TvCastButtonProps) {
  const [available, setAvailable] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      api
        .getTvCastStatus()
        .then((status) => {
          if (cancelled) return;
          setAvailable(status.available);
          setLabel(status.label);
        })
        .catch(() => {
          if (cancelled) return;
          setAvailable(false);
          setLabel(null);
        });
    };

    refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleCast = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await onCast();
      await api.sendTvCast(payload);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not send playback to MEDIA! TV";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [onCast]);

  if (!available) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || loading}
        onClick={handleCast}
        title={label ? `Play on ${label}` : "Play on MEDIA! TV"}
        className={className}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Tv className="h-4 w-4 text-primary" />
        )}
      </Button>
      {error && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-border bg-card p-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
