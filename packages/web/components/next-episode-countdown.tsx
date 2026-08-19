"use client";

import { Button } from "@/components/ui/button";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { MediaImage } from "@/components/media-image";
import { api } from "@/lib/api";
import { tvImageUrl } from "@/lib/tv-image";
import { NEXT_EPISODE_COUNTDOWN_SECONDS } from "@/lib/playback-utils";
import { cn, formatDuration } from "@/lib/utils";
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

function CountdownRing({
  secondsLeft,
  total,
  size,
}: {
  secondsLeft: number;
  total: number;
  size: "tv" | "desktop";
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, secondsLeft / total));

  return (
    <div
      className={cn(
        "relative shrink-0 text-primary",
        size === "tv" ? "h-[5.5rem] w-[5.5rem]" : "h-16 w-16",
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="4"
        />
        <circle
          cx="40"
          cy="40"
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
      <span className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-white">
        <span className={size === "tv" ? "text-3xl" : "text-2xl"}>{secondsLeft}</span>
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

export function NextEpisodeCountdownOverlay({
  countdown,
  label,
  onCancel,
  onPlayNow,
  tv = false,
  seriesTitle,
  fallbackArt,
}: NextEpisodeCountdownOverlayProps) {
  const previewPath = countdown.episode.stillPath ?? fallbackArt ?? null;
  const previewUrl = tv
    ? tvImageUrl(previewPath, { hd: true })
    : api.imageUrl(previewPath);
  const previewReady = usePreloadedImage(previewUrl, 1920);
  const overview = countdown.episode.overview?.trim();
  const duration = countdown.episode.durationMs
    ? formatDuration(countdown.episode.durationMs)
    : null;
  const progressPct =
    (countdown.secondsLeft / NEXT_EPISODE_COUNTDOWN_SECONDS) * 100;

  const playNow = tv ? (
    <TvFocusButton
      autoFocus
      data-tv-next-play=""
      onClick={onPlayNow}
      className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
    >
      Play now
    </TvFocusButton>
  ) : (
    <Button autoFocus onClick={onPlayNow} className="rounded-xl px-6 py-3 font-semibold">
      Play now
    </Button>
  );

  const cancel = tv ? (
    <TvFocusButton
      data-tv-next-cancel=""
      onClick={onCancel}
      className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white"
    >
      Cancel
    </TvFocusButton>
  ) : (
    <Button
      variant="outline"
      onClick={onCancel}
      className="rounded-xl border-white/20 bg-transparent px-6 py-3 font-semibold text-white hover:bg-white/10"
    >
      Cancel
    </Button>
  );

  const copy = (
    <>
      <p
        className={cn(
          "mb-2 font-mono uppercase tracking-[0.2em] text-white/60",
          tv ? "text-sm" : "text-xs",
        )}
      >
        Up next
      </p>
      {seriesTitle ? (
        <p className={cn("mb-1 text-white/80", tv ? "text-lg" : "text-sm")}>{seriesTitle}</p>
      ) : null}
      <p
        className={cn(
          "mb-3 font-semibold leading-tight text-white",
          tv ? "text-3xl" : "text-2xl",
        )}
      >
        {label}
      </p>
      {overview ? (
        <p
          className={cn(
            "mb-4 line-clamp-3 text-white/75",
            tv ? "text-lg leading-snug" : "text-sm leading-6",
          )}
        >
          {overview}
        </p>
      ) : null}
      <p
        className={cn("text-white/80", tv ? "mb-6 text-lg" : "mb-6 text-base")}
        aria-live="polite"
      >
        {duration ? `${duration} · ` : null}
        Playing in {countdown.secondsLeft}s
      </p>
    </>
  );

  if (tv) {
    return (
      <div
        data-tv-watch-next-episode=""
        role="dialog"
        aria-label="Up next"
        className="absolute inset-0 z-30 overflow-hidden bg-black"
      >
        {previewUrl ? (
          <div className="absolute inset-0 opacity-80">
            <PreviewStill
              url={previewUrl}
              ready={previewReady}
              eager
              quality={85}
              sizes="100vw"
            />
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-black/50" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/20" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />

        <div className="relative z-10 flex h-full items-center gap-10 px-16 py-12">
          <div
            data-tv-watch-next-preview=""
            className="relative shrink-0 overflow-hidden rounded-xl border-2 border-white/20 bg-black"
          >
            {previewUrl ? (
              <PreviewStill
                url={previewUrl}
                ready={previewReady}
                eager
                quality={85}
                sizes="50vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-4xl font-bold text-white/40">
                {String(countdown.episode.episodeNumber).padStart(2, "0")}
              </div>
            )}
            <div className="absolute right-4 top-4">
              <CountdownRing
                secondsLeft={countdown.secondsLeft}
                total={NEXT_EPISODE_COUNTDOWN_SECONDS}
                size="tv"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
              <div
                className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="min-w-0 max-w-xl flex-1">
            {copy}
            <div className="flex flex-wrap items-center gap-3">
              {playNow}
              {cancel}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-black" role="dialog" aria-label="Up next">
      {previewUrl ? (
        <div className="absolute inset-0 opacity-70">
          <PreviewStill
            url={previewUrl}
            ready={previewReady}
            quality={80}
            sizes="100vw"
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-8">
        {previewUrl ? (
          <div className="relative mb-6 aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-black">
            <PreviewStill
              url={previewUrl}
              ready={previewReady}
              quality={80}
              sizes="36rem"
            />
            <div className="absolute right-3 top-3">
              <CountdownRing
                secondsLeft={countdown.secondsLeft}
                total={NEXT_EPISODE_COUNTDOWN_SECONDS}
                size="desktop"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div
                className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <CountdownRing
              secondsLeft={countdown.secondsLeft}
              total={NEXT_EPISODE_COUNTDOWN_SECONDS}
              size="desktop"
            />
          </div>
        )}
        <div className="min-w-0 max-w-lg text-center">
          {copy}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {playNow}
            {cancel}
          </div>
        </div>
      </div>
    </div>
  );
}
