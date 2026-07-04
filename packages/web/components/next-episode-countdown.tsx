"use client";

import { Button } from "@/components/ui/button";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import type { NextEpisodeCountdownState } from "@/lib/use-next-episode-countdown";

interface NextEpisodeCountdownOverlayProps {
  countdown: NextEpisodeCountdownState;
  label: string;
  onCancel: () => void;
  onPlayNow: () => void;
  tv?: boolean;
}

export function NextEpisodeCountdownOverlay({
  countdown,
  label,
  onCancel,
  onPlayNow,
  tv = false,
}: NextEpisodeCountdownOverlayProps) {
  if (tv) {
    return (
      <div
        data-tv-watch-next-episode=""
        className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 px-8"
      >
        <div className="max-w-xl text-center">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-white/60">
            Up next
          </p>
          <p className="mb-2 text-2xl font-semibold text-white">{label}</p>
          <p className="mb-8 text-lg text-white/80">
            Playing in {countdown.secondsLeft}s
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TvFocusButton
              autoFocus
              onClick={onPlayNow}
              className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              Play now
            </TvFocusButton>
            <TvFocusButton
              onClick={onCancel}
              className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white"
            >
              Cancel
            </TvFocusButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 px-8">
      <div className="max-w-xl text-center">
        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-white/60">
          Up next
        </p>
        <p className="mb-2 text-2xl font-semibold text-white">{label}</p>
        <p className="mb-8 text-lg text-white/80">
          Playing in {countdown.secondsLeft}s
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            autoFocus
            onClick={onPlayNow}
            className="rounded-xl px-6 py-3 font-semibold"
          >
            Play now
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            className="rounded-xl border-white/20 bg-transparent px-6 py-3 font-semibold text-white hover:bg-white/10"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
