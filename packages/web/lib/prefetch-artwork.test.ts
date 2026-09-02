import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import {
  PLAYBACK_IMAGE_QUALITY,
  PLAYBACK_IMAGE_WIDTH,
  nextOptimizedImageUrl,
} from "./next-image-url";
import type { PlaybackMediaDetail } from "./playback-utils";

const imageSrcs: string[] = [];

beforeEach(() => {
  imageSrcs.length = 0;
  document.head.innerHTML = "";
  vi.stubGlobal(
    "Image",
    class {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      complete = false;
      naturalWidth = 0;
      set src(value: string) {
        imageSrcs.push(value);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

function expectedStillUrl(path: string): string {
  return nextOptimizedImageUrl(
    api.imageUrl(path)!,
    PLAYBACK_IMAGE_WIDTH,
    PLAYBACK_IMAGE_QUALITY,
  );
}

function makeSeries(suffix: string): PlaybackMediaDetail {
  return {
    title: "The Office",
    posterPath: `/poster-${suffix}.jpg`,
    backdropPath: `/back-${suffix}.jpg`,
    seasons: [
      {
        seasonNumber: 2,
        episodes: [
          {
            id: 11,
            episodeNumber: 3,
            title: "The Initiation",
            stillPath: `/still-e3-${suffix}.jpg`,
          },
          {
            id: 12,
            episodeNumber: 4,
            title: "Dinner Party",
            stillPath: `/still-e4-${suffix}.jpg`,
          },
        ],
      },
    ],
  };
}

describe("preloadNextEpisodeArtwork", () => {
  it("warms still, backdrop, and poster at the playback overlay URL", async () => {
    const { preloadNextEpisodeArtwork } = await import("./prefetch-artwork.js");
    const series = makeSeries("overlay");

    preloadNextEpisodeArtwork(
      { episode: series.seasons![0].episodes[1], seasonNumber: 2 },
      series,
    );

    expect(imageSrcs).toEqual([
      expectedStillUrl("/still-e4-overlay.jpg"),
      expectedStillUrl("/back-overlay.jpg"),
      expectedStillUrl("/poster-overlay.jpg"),
    ]);
    expect(imageSrcs.every((src) => src.includes("w=1920") && src.includes("q=80"))).toBe(
      true,
    );
    expect(imageSrcs.some((src) => src.includes("q=85"))).toBe(false);

    const hints = [...document.head.querySelectorAll('link[rel="preload"][as="image"]')];
    expect(hints.map((link) => link.getAttribute("href"))).toEqual(imageSrcs);
  });

  it("does not start a second fetch for the same optimized URL", async () => {
    const { preloadNextEpisodeArtwork } = await import("./prefetch-artwork.js");
    const next = {
      episode: {
        id: 99,
        episodeNumber: 9,
        title: "Unique",
        stillPath: "/unique-still.jpg",
      },
      seasonNumber: 1,
    };

    preloadNextEpisodeArtwork(next);
    preloadNextEpisodeArtwork(next);

    expect(imageSrcs).toEqual([expectedStillUrl("/unique-still.jpg")]);
  });
});

describe("warmNextEpisodeArtwork", () => {
  it("starts next-episode artwork as soon as the current episode media is known", async () => {
    const { warmNextEpisodeArtwork } = await import("./prefetch-artwork.js");
    const series = makeSeries("warm");

    warmNextEpisodeArtwork("episode", series, 11);

    expect(imageSrcs).toContain(expectedStillUrl("/still-e4-warm.jpg"));
    expect(imageSrcs).toContain(expectedStillUrl("/back-warm.jpg"));
    expect(imageSrcs).toContain(expectedStillUrl("/poster-warm.jpg"));
  });

  it("does nothing for movies or a missing next episode", async () => {
    const { warmNextEpisodeArtwork } = await import("./prefetch-artwork.js");
    const series = makeSeries("noop");
    const before = imageSrcs.length;

    warmNextEpisodeArtwork("movie", series, 11);
    warmNextEpisodeArtwork("episode", series, 12);
    warmNextEpisodeArtwork("episode", null, 11);

    expect(imageSrcs.length).toBe(before);
  });
});

describe("prefetchWatchExitTarget", () => {
  it("prefetches the destination route", async () => {
    const { prefetchWatchExitTarget } = await import("./prefetch-artwork.js");
    const prefetch = vi.fn();
    prefetchWatchExitTarget({ prefetch }, "/media/9/");
    expect(prefetch).toHaveBeenCalledWith("/media/9/");
  });
});
