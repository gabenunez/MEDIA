import { describe, expect, it } from "vitest";
import { consolidateSeasonsByNumber } from "./media-detail.js";

describe("consolidateSeasonsByNumber", () => {
  it("shows one season chip when the same season number was stored more than once", () => {
    const seasons = consolidateSeasonsByNumber([
      {
        id: 1,
        seasonNumber: 1,
        name: "Season 1",
        overview: null,
        posterPath: null,
        airDate: null,
        episodes: [{ id: 10, episodeNumber: 1 }],
      },
      {
        id: 6,
        seasonNumber: 6,
        name: "Season 6",
        overview: null,
        posterPath: null,
        airDate: null,
        episodes: [{ id: 20, episodeNumber: 1 }],
      },
      {
        id: 7,
        seasonNumber: 6,
        name: "Season 6",
        overview: "second half",
        posterPath: "/s6.jpg",
        airDate: null,
        episodes: [{ id: 21, episodeNumber: 8 }],
      },
      {
        id: 8,
        seasonNumber: 6,
        name: "Season 6",
        overview: null,
        posterPath: null,
        airDate: null,
        episodes: [{ id: 22, episodeNumber: 3 }],
      },
      {
        id: 9,
        seasonNumber: 6,
        name: "Season 6",
        overview: null,
        posterPath: null,
        airDate: null,
        episodes: [{ id: 23, episodeNumber: 15 }],
      },
    ]);

    expect(seasons.map((season) => season.name)).toEqual(["Season 1", "Season 6"]);
    expect(seasons[1]?.episodes.map((episode) => episode.episodeNumber)).toEqual([
      1, 3, 8, 15,
    ]);
    expect(seasons[1]?.posterPath).toBe("/s6.jpg");
    expect(seasons[1]?.overview).toBe("second half");
  });
});
