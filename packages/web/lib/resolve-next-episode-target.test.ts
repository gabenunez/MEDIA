import { describe, expect, it } from "vitest";
import {
  resolveNextEpisodeTarget,
  type MediaSeasonProgress,
} from "./playback-utils";

const LONG = 42 * 60 * 1000; // 42 min episode

function ep(
  id: number,
  episodeNumber: number,
  progress?: { positionMs: number; updatedAt?: number },
): MediaSeasonProgress["episodes"][number] {
  return {
    id,
    episodeNumber,
    durationMs: LONG,
    watchProgress: progress
      ? {
          positionMs: progress.positionMs,
          durationMs: LONG,
          updatedAt: progress.updatedAt ?? 1,
        }
      : null,
  };
}

describe("resolveNextEpisodeTarget", () => {
  it("resumes the most-recently-watched in-progress episode", () => {
    const seasons: MediaSeasonProgress[] = [
      {
        seasonNumber: 1,
        episodes: [
          ep(1, 1, { positionMs: LONG, updatedAt: 10 }), // finished
          ep(2, 2, { positionMs: LONG / 2, updatedAt: 20 }), // in progress (latest)
          ep(3, 3),
        ],
      },
    ];
    expect(resolveNextEpisodeTarget(seasons)).toEqual({
      seasonIndex: 0,
      episodeId: 2,
    });
  });

  it("advances to the next episode after a finished one", () => {
    const seasons: MediaSeasonProgress[] = [
      {
        seasonNumber: 1,
        episodes: [
          ep(1, 1, { positionMs: LONG, updatedAt: 30 }), // just finished (latest)
          ep(2, 2),
          ep(3, 3),
        ],
      },
    ];
    expect(resolveNextEpisodeTarget(seasons)).toEqual({
      seasonIndex: 0,
      episodeId: 2,
    });
  });

  it("starts at the first episode for a show with no progress", () => {
    const seasons: MediaSeasonProgress[] = [
      { seasonNumber: 1, episodes: [ep(1, 1), ep(2, 2)] },
    ];
    expect(resolveNextEpisodeTarget(seasons)).toEqual({
      seasonIndex: 0,
      episodeId: 1,
    });
  });

  it("returns the FIRST episode (not the last) when the series finale is watched", () => {
    // Regression: a fully-watched show focused the last episode, so pressing
    // Down jumped straight past the episode list to the next section.
    const seasons: MediaSeasonProgress[] = [
      {
        seasonNumber: 1,
        episodes: [
          ep(1, 1, { positionMs: LONG, updatedAt: 10 }),
          ep(2, 2, { positionMs: LONG, updatedAt: 20 }),
          ep(3, 3, { positionMs: LONG, updatedAt: 30 }), // finale, watched last
        ],
      },
    ];
    expect(resolveNextEpisodeTarget(seasons)).toEqual({
      seasonIndex: 0,
      episodeId: 1,
    });
  });

  it("returns null for an empty season list", () => {
    expect(resolveNextEpisodeTarget([])).toBeNull();
  });
});
