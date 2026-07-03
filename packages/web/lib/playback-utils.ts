import type { StreamQuality } from "@/lib/api";

export const PROGRESS_SAVE_MS = 10_000;

export interface TvEpisodeSummary {
  id: number;
  title?: string | null;
  episodeNumber: number;
  stillPath?: string | null;
}

export interface TvSeasonSummary {
  seasonNumber: number;
  episodes: TvEpisodeSummary[];
}

export interface PlaybackMediaDetail {
  title: string;
  posterPath?: string | null;
  seasons?: TvSeasonSummary[];
}

export function pickTranscodeQualityForPlayback(
  available: StreamQuality[],
): Exclude<StreamQuality, "original"> {
  for (const quality of ["720p", "1080p", "480p"] as const) {
    if (available.includes(quality)) return quality;
  }
  const fallback = available.find((quality) => quality !== "original");
  return fallback ?? "720p";
}

export function buildPlaybackTitle(
  type: "movie" | "episode",
  media: PlaybackMediaDetail,
  fileId: number,
): string {
  if (type !== "episode") {
    return media.title;
  }

  for (const season of media.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      if (episode.id !== fileId) continue;

      const episodeName =
        episode.title?.trim() || `Episode ${episode.episodeNumber}`;
      return `${media.title} — ${episodeName} (S${season.seasonNumber}E${episode.episodeNumber})`;
    }
  }

  return media.title;
}

export function findEpisode(
  media: PlaybackMediaDetail,
  fileId: number,
): TvEpisodeSummary | null {
  for (const season of media.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      if (episode.id === fileId) {
        return episode;
      }
    }
  }
  return null;
}
