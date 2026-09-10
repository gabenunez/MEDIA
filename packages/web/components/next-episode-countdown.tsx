"use client";

import { Button } from "@/components/ui/button";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { MediaImage } from "@/components/media-image";
import { api } from "@/lib/api";
import { tvImageUrl } from "@/lib/tv-image";
import { NEXT_EPISODE_COUNTDOWN_SECONDS } from "@/lib/playback-utils";
import { PLAYBACK_IMAGE_QUALITY, PLAYBACK_IMAGE_WIDTH } from "@/lib/next-image-url";
import { cn } from "@/lib/utils";
import { usePreloadedImage } from "@/lib/use-preloaded-image";
import type { NextEpisodeCountdownState } from "@/lib/use-next-episode-countdown";

interface NextEpisodeCountdownOverlayProps {
  countdown: NextEpisodeCountdownState;
  label: string;
  onCancel: () => void;
  onPlayNow: () => void;
  tv?: boolean;
  seriesTitle?: string | null;
  fallbackArt?: string | null;
}

/** Circular progress loader overlaid on the next-episode still. */
function CountdownLoader({
  secondsLeft,
  total,
  size,
}: {
  secondsLeft: number;
  total: number;
  size: "tv" | "desktop";
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, secondsLeft / total));
  const dim = size === "tv" ? "h-14 w-14" : "h-12 w-12";

  return (
    <div className={cn("relative shrink-0 text-primary", dim)} aria-hidden="true">
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="4"
        />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-white",
          size === "tv" ? "text-xl" : "text-lg",
        )}
      >
        {secondsLeft}
      </span>
    </div>
  );
}

function PreviewStill({
  url,
  ready,
  className,
  sizes,
  quality,
  eager,
}: {
  url: string;
  ready: boolean;
  className?: string;
  sizes: string;
  quality: number;
  eager?: boolean;
}) {
  return (
    <MediaImage
      src={url}
      alt=""
      fill
      priority
      loading={eager ? "eager" : undefined}
      quality={quality}
      sizes={sizes}
      className={cn(
        "object-cover transition-opacity duration-200",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}

/**
 * Inline “up next” card — bottom-right over the playing/ended frame.
 * Auto-advances; Cancel dismisses without starting the next episode.
 */
export function NextEpisodeCountdownOverlay({
  countdown,
  label,
  onCancel,
  onPlayNow,
  tv = false,
  seriesTitle: _seriesTitle,
  fallbackArt,
}: NextEpisodeCountdownOverlayProps) {
  void _seriesTitle;

  const previewPath = countdown.episode.stillPath ?? fallbackArt ?? null;
  const previewUrl = tv
    ? tvImageUrl(previewPath, { hd: true })
    : api.imageUrl(previewPath);
  const previewReady = usePreloadedImage(
    previewUrl,
    PLAYBACK_IMAGE_WIDTH,
    PLAYBACK_IMAGE_QUALITY,
  );
  const progressPct =
    (countdown.secondsLeft / NEXT_EPISODE_COUNTDOWN_SECONDS) * 100;
  const statusText = `Next episode playing in ${countdown.secondsLeft} ${
    countdown.secondsLeft === 1 ? "second" : "seconds"
  }`;

  const cancelButton = tv ? (
    <TvFocusButton
      autoFocus
      data-tv-next-cancel=""
      onClick={onCancel}
      className="w-full rounded-lg px-4 py-2.5 text-base font-semibold text-white"
    >
      Cancel
    </TvFocusButton>
  ) : (
    <Button
      autoFocus
      variant="outline"
      onClick={onCancel}
      className="w-full rounded-lg border-white/20 bg-black/80 px-4 py-2.5 font-semibold text-white hover:bg-white/10"
    >
      Cancel
    </Button>
  );

  const previewBody = (
    <div className="relative aspect-video w-full">
      {previewUrl ? (
        <PreviewStill
          url={previewUrl}
          ready={previewReady}
          eager={tv}
          quality={PLAYBACK_IMAGE_QUALITY}
          sizes={tv ? "32vw" : "20rem"}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-neutral-900 font-mono text-3xl font-bold text-white/35">
          {String(countdown.episode.episodeNumber).padStart(2, "0")}
        </div>
      )}

      {/* Solid scrim — no backdrop-blur (Android TV WebView). */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />

      <div className="pointer-events-none absolute right-3 top-3">
        <CountdownLoader
          secondsLeft={countdown.secondsLeft}
          total={NEXT_EPISODE_COUNTDOWN_SECONDS}
          size={tv ? "tv" : "desktop"}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5 pt-10">
        <p
          className={cn(
            "font-semibold leading-snug text-white",
            tv ? "text-base" : "text-sm",
          )}
          aria-live="polite"
        >
          {statusText}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-white/75",
            tv ? "text-sm" : "text-xs",
          )}
        >
          {label}
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full bg-primary transition-[width] duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );

  const previewCard = tv ? (
    <TvFocusButton
      variant="card"
      data-tv-watch-next-preview=""
      data-tv-next-play=""
      onClick={onPlayNow}
      aria-label={`Play now: ${label}`}
      className="relative block w-full overflow-hidden rounded-xl border-2 border-white/20 bg-neutral-950 p-0 text-left"
    >
      {previewBody}
    </TvFocusButton>
  ) : (
    <button
      type="button"
      onClick={onPlayNow}
      className="relative block w-full overflow-hidden rounded-xl border-2 border-white/20 bg-neutral-950 text-left outline-none focus-visible:border-primary"
      aria-label={`Play now: ${label}`}
    >
      {previewBody}
    </button>
  );

  const card = (
    <div className="flex flex-col gap-3">
      {previewCard}
      {cancelButton}
    </div>
  );

  if (tv) {
    return (
      <div
        data-tv-watch-next-episode=""
        role="dialog"
        aria-label="Next episode"
        className="pointer-events-none absolute bottom-10 right-10 z-30 w-[min(22rem,32vw)] animate-tv-next-episode-in"
      >
        <div className="pointer-events-auto">{card}</div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Next episode"
      className="pointer-events-none absolute bottom-8 right-8 z-30 w-[min(20rem,38vw)] animate-tv-next-episode-in"
    >
      <div className="pointer-events-auto">{card}</div>
    </div>
  );
}
