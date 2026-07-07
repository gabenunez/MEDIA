import { describe, expect, it } from "vitest";
import {
  parseDeckId,
  parseFavoritesFilter,
  parseLibraryId,
  parseMediaId,
  parseWatchRoute,
  resolveLegacyRouteRedirect,
  resolveSpaIndexFile,
} from "./routes.js";

describe("route parsers", () => {
  it("parses media paths", () => {
    expect(parseMediaId("/media/7")).toBe(7);
    expect(parseMediaId("/media/7/")).toBe(7);
    expect(parseMediaId("/media/")).toBeNull();
  });

  it("parses library and deck paths", () => {
    expect(parseLibraryId("/library/3/")).toBe(3);
    expect(parseDeckId("/deck/5/")).toBe(5);
  });

  it("parses watch paths", () => {
    expect(parseWatchRoute("/watch/movie/42/")).toEqual({
      type: "movie",
      fileId: 42,
    });
    expect(parseWatchRoute("/watch/episode/891/")).toEqual({
      type: "episode",
      fileId: 891,
    });
  });

  it("parses favorites filters", () => {
    expect(parseFavoritesFilter("/favorites/")).toBe("all");
    expect(parseFavoritesFilter("/favorites/movie/")).toBe("movie");
    expect(parseFavoritesFilter("/favorites/tv/")).toBe("tv");
  });
});

describe("resolveSpaIndexFile", () => {
  it("maps entity paths to static shells", () => {
    expect(resolveSpaIndexFile("/media/7/")).toBe("media/index.html");
    expect(resolveSpaIndexFile("/watch/movie/42/")).toBe("watch/index.html");
    expect(resolveSpaIndexFile("/deck/5/")).toBe("deck/index.html");
    expect(resolveSpaIndexFile("/favorites/movie/")).toBe("favorites/index.html");
    expect(resolveSpaIndexFile("/settings/")).toBeNull();
  });
});

describe("resolveLegacyRouteRedirect", () => {
  it("redirects query-param URLs to path routes", () => {
    expect(resolveLegacyRouteRedirect("/media/", "?id=7")).toBe("/media/7/");
    expect(resolveLegacyRouteRedirect("/library/", "?id=3")).toBe("/library/3/");
    expect(resolveLegacyRouteRedirect("/library/", "?deck=5")).toBe("/deck/5/");
    expect(resolveLegacyRouteRedirect("/watch/", "?type=movie&id=42")).toBe(
      "/watch/movie/42/",
    );
    expect(
      resolveLegacyRouteRedirect("/watch/", "?type=episode&id=891&media=45&start=120"),
    ).toBe("/watch/episode/891/?media=45&start=120");
    expect(resolveLegacyRouteRedirect("/favorites/", "?type=movie")).toBe(
      "/favorites/movie/",
    );
  });
});
