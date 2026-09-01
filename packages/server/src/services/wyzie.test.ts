import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAllowedWyzieDownloadUrl,
  normalizeWyzieLanguages,
  parseWyzieSearchItems,
  prepareWyzieDownloadUrl,
  withWyzieKey,
  wyzieMediaId,
  WyzieService,
} from "./wyzie.js";

describe("wyzieMediaId", () => {
  it("prefers IMDb ids and keeps the tt prefix", () => {
    expect(wyzieMediaId("tt3659388", 286217)).toBe("tt3659388");
    expect(wyzieMediaId("3659388", 286217)).toBe("tt3659388");
  });

  it("falls back to TMDB when IMDb is missing", () => {
    expect(wyzieMediaId(null, 286217)).toBe("286217");
    expect(wyzieMediaId("", 0)).toBeNull();
  });
});

describe("parseWyzieSearchItems", () => {
  it("accepts arrays, wrapped data, and a single object", () => {
    expect(parseWyzieSearchItems({ url: "https://sub.wyzie.io/c/1" })).toHaveLength(1);
    expect(
      parseWyzieSearchItems({ data: [{ url: "https://sub.wyzie.io/c/1" }] }),
    ).toHaveLength(1);
    expect(parseWyzieSearchItems([{ id: "1" }])).toEqual([]);
  });

  it("drops non-SRT results", () => {
    expect(
      parseWyzieSearchItems([
        { url: "https://sub.wyzie.io/c/ass", format: "ass" },
        { url: "https://sub.wyzie.io/c/srt", format: "srt" },
      ]),
    ).toEqual([{ url: "https://sub.wyzie.io/c/srt", format: "srt" }]);
  });
});

describe("withWyzieKey", () => {
  it("appends the key when the download URL has none", () => {
    expect(withWyzieKey("https://sub.wyzie.io/c/1?format=srt", "abc")).toContain(
      "key=abc",
    );
  });
});

describe("prepareWyzieDownloadUrl", () => {
  it("allows only https://sub.wyzie.io and adds key plus encoding", () => {
    expect(isAllowedWyzieDownloadUrl("https://example.com/c/1")).toBe(false);
    expect(isAllowedWyzieDownloadUrl("http://sub.wyzie.io/c/1")).toBe(false);
    expect(() => prepareWyzieDownloadUrl("https://example.com/c/1", "abc")).toThrow(
      /Invalid Wyzie download URL/,
    );

    const prepared = prepareWyzieDownloadUrl(
      "https://sub.wyzie.io/c/1?format=srt",
      "abc",
    );
    expect(prepared).toContain("key=abc");
    expect(prepared).toContain("encoding=utf-8");
  });
});

describe("normalizeWyzieLanguages", () => {
  it("trims and lowercases comma-separated codes", () => {
    expect(normalizeWyzieLanguages("en, ES, fr")).toBe("en,es,fr");
    expect(normalizeWyzieLanguages("")).toBe("");
  });
});

describe("WyzieService.search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps source=all results and tags them as Wyzie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            id: "1955024019",
            url: "https://sub.wyzie.io/c/198e0c4d/id/1955024019?format=srt",
            language: "en",
            release: "The.Martian.2015.1080p.WEB-DL",
            fileName: "the.martian.2015.1080p.web-dl.srt",
            downloadCount: 12,
            isHearingImpaired: false,
            source: "subdl",
            ai: true,
          },
        ],
      })),
    );

    const service = new WyzieService({
      get: () => ({ subtitles: { wyzie_api_key: "test-key" } }) as never,
    });
    const results = await service.search({
      tmdbId: 286217,
      languages: "en, ES",
      seasonNumber: 1,
      episodeNumber: 2,
    });

    expect(results).toEqual([
      expect.objectContaining({
        id: "1955024019",
        provider: "wyzie",
        source: "subdl",
        sourceLabel: "Wyzie · SubDL · AI",
        language: "en",
      }),
    ]);
    const requestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(requestUrl).toContain("source=all");
    expect(requestUrl).toContain("key=test-key");
    expect(requestUrl).toContain("encoding=utf-8");
    expect(requestUrl).toContain("language=en%2Ces");
    expect(requestUrl).toContain("season=1");
    expect(requestUrl).toContain("episode=2");
  });

  it("rejects downloads that are not on sub.wyzie.io", async () => {
    const service = new WyzieService({
      get: () => ({ subtitles: { wyzie_api_key: "test-key" } }) as never,
    });
    await expect(service.downloadSubtitleFile("https://example.com/sub.srt")).rejects.toThrow(
      /Invalid Wyzie download URL/,
    );
  });
});
