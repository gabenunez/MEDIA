import { and, asc, eq, inArray } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { tvEpisodes, tvSeasons, watchProgress } from "../db/schema.js";

type SeasonEpisode = { id: number; episodeNumber: number };

type ConsolidatableSeason<TEpisode extends SeasonEpisode> = {
  id: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  airDate: string | null;
  episodes: TEpisode[];
};

/** One chip per season number, with every episode from duplicate rows. */
export function consolidateSeasonsByNumber<
  TEpisode extends SeasonEpisode,
  TSeason extends ConsolidatableSeason<TEpisode>,
>(seasons: TSeason[]): TSeason[] {
  const grouped = new Map<number, TSeason>();

  for (const season of seasons) {
    const existing = grouped.get(season.seasonNumber);
    if (!existing) {
      grouped.set(season.seasonNumber, {
        ...season,
        episodes: [...season.episodes],
      });
      continue;
    }

    existing.episodes.push(...season.episodes);
    existing.name = existing.name ?? season.name;
    existing.overview = existing.overview ?? season.overview;
    existing.posterPath = existing.posterPath ?? season.posterPath;
    existing.airDate = existing.airDate ?? season.airDate;
  }

  return [...grouped.values()]
    .map((season) => ({
      ...season,
      episodes: [...season.episodes].sort(
        (a, b) => a.episodeNumber - b.episodeNumber || a.id - b.id,
      ),
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

export async function loadTvSeasonsWithEpisodes(
  db: DatabaseInstance,
  mediaItemId: number,
) {
  const seasons = await db.query.tvSeasons.findMany({
    where: eq(tvSeasons.mediaItemId, mediaItemId),
    orderBy: [tvSeasons.seasonNumber],
  });

  if (!seasons.length) {
    return [];
  }

  const seasonIds = seasons.map((season) => season.id);
  // Only the fields the media detail / watch pages actually use. The full row
  // (filePath, codecs, fileSize, etc.) and per-episode subtitle lists are not
  // needed here and bloat the payload badly for long series (e.g. 176 episodes
  // → ~160KB), which slows navigation on TV. Playback fetches file/subtitle
  // details separately via /api/stream/:fileId.
  const episodes = await db.query.tvEpisodes.findMany({
    where: inArray(tvEpisodes.seasonId, seasonIds),
    columns: {
      id: true,
      seasonId: true,
      episodeNumber: true,
      title: true,
      overview: true,
      durationMs: true,
      stillPath: true,
    },
    orderBy: [asc(tvEpisodes.seasonId), asc(tvEpisodes.episodeNumber)],
  });

  const episodeIds = episodes.map((episode) => episode.id);
  const progressRows = episodeIds.length
    ? await db.query.watchProgress.findMany({
        where: and(
          eq(watchProgress.itemType, "episode"),
          inArray(watchProgress.itemId, episodeIds),
        ),
        columns: { itemId: true, positionMs: true, durationMs: true, updatedAt: true },
      })
    : [];

  const progressByEpisodeId = new Map(
    progressRows.map((row) => [row.itemId, row]),
  );

  const episodesBySeasonId = new Map<number, typeof episodes>();
  for (const episode of episodes) {
    const list = episodesBySeasonId.get(episode.seasonId) ?? [];
    list.push(episode);
    episodesBySeasonId.set(episode.seasonId, list);
  }

  return consolidateSeasonsByNumber(
    seasons.map((season) => ({
      ...season,
      episodes: (episodesBySeasonId.get(season.id) ?? []).map((episode) => ({
        ...episode,
        watchProgress: progressByEpisodeId.get(episode.id) ?? null,
      })),
    })),
  );
}
