"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaRouteId } from "@/lib/use-route-params";
import { useIsClient } from "@/lib/use-browser-pathname";
import { Loader2, Play } from "lucide-react";
import { TV_HERO_IMAGE_QUALITY, TV_LIST_IMAGE_QUALITY, tvImageUrl } from "@/lib/tv-image";
import { routes } from "@/lib/routes";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";
import { TvFavoriteButton } from "@/components/tv/tv-favorite-button";
import { TvHistoryBackButton, TvSectionLabel } from "@/components/tv/tv-page-header";
import { TvPoster } from "@/components/tv/tv-poster";
import { TvRow, tvScrollRowClassName } from "@/components/tv/tv-row";
import { ThemeMusicProvider, ThemeMusicWaveform } from "@/components/theme-music-player";
import { FixMatchDialog } from "@/components/fix-match-dialog";
import { formatDuration, getPlaybackButtonLabel, canResumePlayback, START_FROM_BEGINNING_LABEL } from "@/lib/utils";
import { resolveNextEpisodeTarget } from "@/lib/playback-utils";
import { useDocumentTitle } from "@/lib/use-document-title";
import { focusEpisodeItem, focusFirstContentItem, focusMediaPlayItem } from "@/lib/tv-focus";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/media-image";
import { invalidateApiCache } from "@/lib/api-cache";
import type { MediaItem } from "@/lib/api";
import type { MediaDetail } from "@/app/media/types";
import { useMediaPageData } from "@/lib/use-media-page-data";
import { useMarkTvBootReadyWhen } from "@/components/tv/tv-boot-ready";

export function TvMediaView({
  media: mediaProp,
  mediaId: mediaIdProp,
  initialMedia,
}: {
  media?: MediaDetail;
  mediaId?: number;
  initialMedia?: Record<string, unknown>;
} = {}) {
  if (mediaProp) {
    return <TvMediaViewContent media={mediaProp} serverShell />;
  }

  const hasResolvedId = mediaIdProp != null && Number.isFinite(mediaIdProp);
  if (!hasResolvedId) {
    return <TvMediaViewLegacy />;
  }

  return (
    <TvMediaViewResolved
      key={mediaIdProp}
      mediaId={mediaIdProp}
      initialMedia={initialMedia}
    />
  );
}

function TvMediaViewLegacy() {
  const isClient = useIsClient();
  const mediaId = useMediaRouteId();

  useMarkTvBootReadyWhen(isClient);

  if (!mediaId || Number.isNaN(mediaId)) {
    if (!isClient) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="tv-ui tv-media-gutter py-16 text-center">
        <p className="mb-6 text-xl text-muted-foreground">Invalid media</p>
        <div data-tv-row="" data-tv-content-row="" className="flex justify-center">
          <TvFocusLink
            href={routes.home()}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground"
          >
            Back to home
          </TvFocusLink>
        </div>
      </div>
    );
  }

  return <TvMediaViewResolved key={mediaId} mediaId={mediaId} />;
}

function TvMediaViewResolved({
  mediaId,
  initialMedia,
}: {
  mediaId: number;
  initialMedia?: Record<string, unknown>;
}) {
  const { media: mediaRecord, related } = useMediaPageData(mediaId, initialMedia);
  const media = (mediaRecord ?? initialMedia) as unknown as MediaDetail | null;

  useMarkTvBootReadyWhen(Boolean(media));

  if (!media) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TvMediaViewContent
      media={media}
      related={related}
      includeDocumentTitle
      includeTheme
    />
  );
}

function TvMediaViewContent({
  media,
  related = [],
  serverShell = false,
  includeDocumentTitle = false,
  includeTheme = false,
}: {
  media: MediaDetail;
  related?: MediaItem[];
  serverShell?: boolean;
  includeDocumentTitle?: boolean;
  includeTheme?: boolean;
}) {
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [fixMatchOpen, setFixMatchOpen] = useState(false);
  const nextEpisodeIdRef = useRef<number | null>(null);
  const initializedMediaIdRef = useRef<number | null>(null);

  useMarkTvBootReadyWhen(true);

  useDocumentTitle(includeDocumentTitle ? media.title : null);

  useEffect(() => {
    // API refreshes replace the media object. Do not steal focus after the
    // viewer selects Favorite, a season, or any other media-page control.
    if (initializedMediaIdRef.current === media.id) return;
    if (media.type === "tv" && !media.seasons?.length) return;

    initializedMediaIdRef.current = media.id;
    let nextEpisodeId: number | null = null;
    if (media.type === "tv" && media.seasons?.length) {
      const target = resolveNextEpisodeTarget(media.seasons);
      setSelectedSeason(target?.seasonIndex ?? 0);
      nextEpisodeId = target?.episodeId ?? null;
      nextEpisodeIdRef.current = nextEpisodeId;
    } else {
      setSelectedSeason(0);
      nextEpisodeIdRef.current = null;
    }

    requestAnimationFrame(() => {
      if (media.type === "movie" && focusMediaPlayItem()) return;
      if (media.type === "tv" && nextEpisodeId != null && focusEpisodeItem(nextEpisodeId)) {
        return;
      }
      focusFirstContentItem();
    });
  }, [media.id, media.type, media.seasons]);

  const backdropUrl = tvImageUrl(media.backdropPath ?? media.posterPath, { hd: true });
  const posterUrl = tvImageUrl(media.posterPath, { hd: true });
  const seasons = media.seasons ?? [];
  const episodes = seasons[selectedSeason]?.episodes ?? [];
  const movieFile = media.files?.[0];
  const moviePlaybackLabel = movieFile
    ? getPlaybackButtonLabel(
        media.watchProgress?.positionMs,
        media.watchProgress?.durationMs ?? movieFile.durationMs,
      )
    : "Play";
  const movieCanResume = Boolean(
    movieFile &&
      canResumePlayback(
        media.watchProgress?.positionMs,
        media.watchProgress?.durationMs ?? movieFile?.durationMs,
      ),
  );
  const typeLabel = media.type === "movie" ? "Movie" : "Series";
  const metaLabel = [typeLabel, media.year].filter(Boolean).join(" · ");
  const showRelated = !serverShell && related.length > 0;
  const showThemeWaveform = media.hasThemeMusic && (includeTheme || serverShell);
  const needsMatch = Boolean(media.needsMatch) || !media.tmdbId;

  const page = (
    <div className="tv-media-page">
      <section className="relative mb-4">
        <div className="relative overflow-hidden tv-media-hero">
          {backdropUrl ? (
            <MediaImage
              src={backdropUrl}
              alt=""
              fill
              priority
              quality={TV_HERO_IMAGE_QUALITY}
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="signal-grid absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/25" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/55 to-transparent" />
          {showThemeWaveform && (
            <ThemeMusicWaveform className="absolute inset-x-0 bottom-0 h-16 w-full [mask-image:linear-gradient(to_top,black_15%,transparent)]" />
          )}
        </div>

        <div className="tv-media-gutter absolute inset-x-0 top-4 z-20">
          <TvHistoryBackButton fallbackHref={routes.home()} />
        </div>

        <div className="relative z-10 -mt-20 tv-media-gutter">
          <div className="flex gap-4">
            <div className="tv-media-poster shrink-0">
              {posterUrl ? (
                <MediaImage
                  src={posterUrl}
                  alt=""
                  width={112}
                  height={168}
                  priority
                  quality={TV_HERO_IMAGE_QUALITY}
                  sizes="7rem"
                  className="aspect-[2/3] w-full rounded-md poster-shadow"
                />
              ) : (
                <div className="signal-grid aspect-[2/3] w-full rounded-md bg-muted" />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-end pb-1">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-primary">
                {metaLabel}
              </p>
              <h1 className="tv-media-title mb-2 line-clamp-2">
                {media.title}
              </h1>
              {media.overview && (
                <p className="tv-media-overview mb-3 line-clamp-2 max-w-3xl">
                  {media.overview}
                </p>
              )}

              {needsMatch && (
                <p className="mb-2 text-xs text-amber-100/85">
                  Unmatched — pick the correct listing below.
                </p>
              )}

              <div
                data-tv-row=""
                data-tv-content-row=""
                className="tv-media-actions flex flex-wrap items-center py-0.5"
              >
                {media.type === "movie" && movieFile && (
                  <>
                    <TvFocusLink
                      href={routes.watch("movie", movieFile.id, media.id)}
                      data-tv-media-play=""
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 text-primary-foreground"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      {moviePlaybackLabel}
                    </TvFocusLink>
                    {movieCanResume && (
                      <TvFocusLink
                        href={routes.watchFromStart("movie", movieFile.id, media.id)}
                        className="inline-flex items-center rounded-lg border-2 border-white/20 px-4 py-2 text-sm text-white"
                      >
                        {START_FROM_BEGINNING_LABEL}
                      </TvFocusLink>
                    )}
                  </>
                )}
                <TvFavoriteButton
                  mediaId={media.id}
                  initialFavorite={media.isFavorite}
                  className="!gap-2 !px-4 !py-2 !text-sm"
                />
                <TvFocusButton
                  onClick={() => setFixMatchOpen(true)}
                  className="rounded-lg px-4 text-muted-foreground"
                >
                  {needsMatch ? "Match title" : "Wrong match?"}
                </TvFocusButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {media.type === "tv" && seasons.length > 0 && (
        <section>
          <div className="tv-media-gutter">
            <TvSectionLabel>Seasons</TvSectionLabel>
          </div>
          <div
            data-tv-row=""
            data-tv-content-row=""
            data-tv-scroll-row=""
            className={cn(tvScrollRowClassName, "tv-media-season-row mb-3")}
          >
            {seasons.map((season, idx) => (
              <TvFocusButton
                key={season.id}
                variant="chip"
                selected={selectedSeason === idx}
                onClick={() => setSelectedSeason(idx)}
                className="px-4 py-2 text-sm"
              >
                {season.name ?? `Season ${season.seasonNumber}`}
              </TvFocusButton>
            ))}
          </div>

          <div className="tv-media-gutter">
            <TvSectionLabel>
              Episodes
              {episodes.length > 0 ? ` · ${episodes.length}` : ""}
            </TvSectionLabel>
            <div
              data-tv-row=""
              data-tv-content-row=""
              data-tv-vertical=""
              className="flex flex-col gap-1.5"
            >
            {episodes.map((ep, episodeIndex) => {
              const episodeDurationMs = ep.watchProgress?.durationMs ?? ep.durationMs;
              const episodeActionLabel = getPlaybackButtonLabel(
                ep.watchProgress?.positionMs,
                episodeDurationMs,
              );
              const episodeCanResume = canResumePlayback(
                ep.watchProgress?.positionMs,
                episodeDurationMs,
              );
              const progressPct =
                ep.watchProgress && ep.watchProgress.positionMs > 0
                  ? Math.min(
                      100,
                      (ep.watchProgress.positionMs / (ep.durationMs ?? 1)) * 100,
                    )
                  : 0;

              return (
                <div key={ep.id} className="flex flex-col gap-1">
                  <TvFocusLink
                    href={routes.watch("episode", ep.id, media.id)}
                    variant="card"
                    data-tv-episode-id={ep.id}
                    className="tv-media-episode flex items-center gap-3 px-3 py-2"
                  >
                  <div className="tv-episode-still relative shrink-0 overflow-hidden rounded-md bg-muted">
                    {ep.stillPath ? (
                      <MediaImage
                        src={tvImageUrl(ep.stillPath)}
                        alt=""
                        fill
                        priority={episodeIndex < 8}
                        loading="eager"
                        quality={TV_LIST_IMAGE_QUALITY}
                        sizes="6.75rem"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-base font-bold text-muted-foreground">
                        {String(ep.episodeNumber).padStart(2, "0")}
                      </div>
                    )}
                    {progressPct > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/25">
                        <div className="h-full bg-accent" style={{ width: `${progressPct}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="tv-media-episode-title truncate">
                      <span className="mr-1.5 font-mono text-xs text-primary">
                        {String(ep.episodeNumber).padStart(2, "0")}
                      </span>
                      {ep.title ?? `Episode ${ep.episodeNumber}`}
                    </p>
                    {ep.overview && (
                      <p className="tv-media-episode-overview mt-0.5 line-clamp-1 text-muted-foreground">
                        {ep.overview}
                      </p>
                    )}
                  </div>

                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {episodeActionLabel === "Play" && ep.durationMs
                      ? formatDuration(ep.durationMs)
                      : episodeActionLabel}
                  </span>
                </TvFocusLink>
                {episodeCanResume && (
                  <TvFocusLink
                    href={routes.watchFromStart("episode", ep.id, media.id)}
                    className="mx-3 mb-1 inline-flex self-start rounded-lg border-2 border-white/15 px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {START_FROM_BEGINNING_LABEL}
                  </TvFocusLink>
                )}
              </div>
              );
            })}
            </div>
          </div>
        </section>
      )}

      {showRelated && (
        <TvRow
          title={
            media.type === "movie"
              ? "More films in your library"
              : "More series in your library"
          }
          className="mt-4"
          prefetchItems={related}
        >
          {related.map((item) => (
            <TvPoster key={item.id} item={item} />
          ))}
        </TvRow>
      )}

      <FixMatchDialog
        open={fixMatchOpen}
        onClose={() => setFixMatchOpen(false)}
        mediaId={media.id}
        mediaType={media.type}
        initialTitle={media.title}
        initialYear={media.year}
        currentImdbId={media.imdbId}
        currentTmdbId={media.tmdbId}
        tv
        onMatched={() => {
          invalidateApiCache(`media:${media.id}`);
          window.location.assign(window.location.pathname + window.location.search);
        }}
      />
    </div>
  );

  if (includeTheme && media.hasThemeMusic) {
    return <ThemeMusicProvider mediaId={media.id}>{page}</ThemeMusicProvider>;
  }

  return page;
}
