import { describe, expect, it } from "vitest";
import {
  isAppRoute,
  markRouteErrorRetried,
  routeErrorAction,
  routeErrorKey,
  wasRouteErrorRetried,
} from "./route-error-recovery";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("isAppRoute", () => {
  it("accepts catalog, title, and playback routes", () => {
    expect(isAppRoute("/")).toBe(true);
    expect(isAppRoute("/favorites")).toBe(true);
    expect(isAppRoute("/favorites/movie/")).toBe(true);
    expect(isAppRoute("/media/42/")).toBe(true);
    expect(isAppRoute("/library/3")).toBe(true);
    expect(isAppRoute("/deck/8/")).toBe(true);
    expect(isAppRoute("/watch/episode/15/")).toBe(true);
    expect(isAppRoute("/settings/")).toBe(true);
  });

  it("rejects unknown and invalid entity paths", () => {
    expect(isAppRoute("/nope/")).toBe(false);
    expect(isAppRoute("/media/0/")).toBe(false);
    expect(isAppRoute("/watch/clip/4/")).toBe(false);
    expect(isAppRoute("/media/abc/")).toBe(false);
  });
});

describe("routeErrorAction", () => {
  it("reloads a real route once", () => {
    const storage = memoryStorage();
    const key = routeErrorKey("/media/42/", "?x=1");
    expect(routeErrorAction("/media/42/", wasRouteErrorRetried(storage, key, 1_000))).toBe(
      "reload",
    );

    markRouteErrorRetried(storage, key, 1_000);
    expect(routeErrorAction("/media/42/", wasRouteErrorRetried(storage, key, 2_000))).toBe(
      "show",
    );
    expect(routeErrorAction("/media/42/", wasRouteErrorRetried(storage, key, 20_000))).toBe(
      "reload",
    );
  });

  it("shows the error screen for a route the app does not serve", () => {
    expect(routeErrorAction("/missing/", false)).toBe("show");
  });

  it("does not treat a different route as already retried", () => {
    const storage = memoryStorage();
    markRouteErrorRetried(storage, routeErrorKey("/media/1/"), 1_000);
    const other = routeErrorKey("/library/2/");
    expect(wasRouteErrorRetried(storage, other, 2_000)).toBe(false);
    expect(routeErrorAction("/library/2/", false)).toBe("reload");
  });
});
