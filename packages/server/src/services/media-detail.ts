import { and, asc, eq, inArray } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import {
  subtitles,
  tvEpisodes,
  tvSeasons,
  watchProgress,
} from "../db/schema.js";

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
  const episodes = await db.query.tvEpisodes.findMany({
    where: inArray(tvEpisodes.seasonId, seasonIds),
    orderBy: [asc(tvEpisodes.seasonId), asc(tvEpisodes.episodeNumber)],
  });

  const episodeIds = episodes.map((episode) => episode.id);
  const [progressRows, subtitleRows] = await Promise.all([
    episodeIds.length
      ? db.query.watchProgress.findMany({
          where: and(
            eq(watchProgress.itemType, "episode"),
            inArray(watchProgress.itemId, episodeIds),
          ),
        })
      : Promise.resolve([]),
    episodeIds.length
      ? db.query.subtitles.findMany({
          where: inArray(subtitles.episodeId, episodeIds),
        })
      : Promise.resolve([]),
  ]);

  const progressByEpisodeId = new Map(
    progressRows.map((row) => [row.itemId, row]),
  );
  const subtitlesByEpisodeId = new Map<number, typeof subtitleRows>();
  for (const subtitle of subtitleRows) {
    if (subtitle.episodeId == null) continue;
    const list = subtitlesByEpisodeId.get(subtitle.episodeId) ?? [];
    list.push(subtitle);
    subtitlesByEpisodeId.set(subtitle.episodeId, list);
  }

  const episodesBySeasonId = new Map<number, typeof episodes>();
  for (const episode of episodes) {
    const list = episodesBySeasonId.get(episode.seasonId) ?? [];
    list.push(episode);
    episodesBySeasonId.set(episode.seasonId, list);
  }

  return seasons.map((season) => ({
    ...season,
    episodes: (episodesBySeasonId.get(season.id) ?? []).map((episode) => ({
      ...episode,
      watchProgress: progressByEpisodeId.get(episode.id) ?? null,
      subtitles: subtitlesByEpisodeId.get(episode.id) ?? [],
    })),
  }));
}
