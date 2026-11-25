import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeTvRemoteBack,
  installTvRemoteBackBridge,
  installTvWatchReentryGuard,
  isTvHomePath,
  isTvWatchPath,
  tvBackSteps,
  tvWatchExitHref,
} from "./tv-back";

describe("isTvHomePath", () => {
  it("treats /, trailing slashes, and empty as home", () => {
    expect(isTvHomePath("/")).toBe(true);
    expect(isTvHomePath("")).toBe(true);
    expect(isTvHomePath("/media/9/")).toBe(false);
    expect(isTvHomePath("/search/")).toBe(false);
  });
});

describe("isTvWatchPath", () => {
  it("matches watch routes only", () => {
    expect(isTvWatchPath("/watch/movie/1/")).toBe(true);
    expect(isTvWatchPath("/watch/episode/9/?media=3")).toBe(true);
    expect(isTvWatchPath("/watch/")).toBe(true);
    expect(isTvWatchPath("/media/9/")).toBe(false);
    expect(isTvWatchPath("/")).toBe(false);
  });
});

describe("tvWatchExitHref", () => {
  it("prefers the media query param, otherwise home", () => {
    expect(tvWatchExitHref("/watch/movie/1/", "?media=42")).toBe("/media/42/");
    expect(tvWatchExitHref("/watch/episode/9/", "media=7")).toBe("/media/7/");
    expect(tvWatchExitHref("/watch/movie/1/", "")).toBe("/");
  });
});

describe("consumeTvRemoteBack", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets the watch handler consume Back first", () => {
    const goBack = vi.fn();
    const watchHandler = vi.fn(() => true);
    expect(
      consumeTvRemoteBack({
        watchHandler,
        pathname: "/watch/movie/1/",
        historyLength: 3,
        goBack,
      }),
    ).toBe(true);
    expect(watchHandler).toHaveBeenCalledOnce();
    expect(goBack).not.toHaveBeenCalled();
  });

  it("starts catalog Back immediately when watch does not consume", () => {
    const goBack = vi.fn();
    expect(
      consumeTvRemoteBack({
        watchHandler: () => false,
        pathname: "/media/9/",
        historyLength: 3,
        goBack,
      }),
    ).toBe(true);
    expect(goBack).toHaveBeenCalledOnce();
  });

  it("lets an open search editor consume Back without leaving the search", () => {
    const goBack = vi.fn();
    const searchHandler = vi.fn(() => true);
    expect(consumeTvRemoteBack({ pathname: "/search/", historyLength: 2, goBack, searchHandler })).toBe(true);
    expect(searchHandler).toHaveBeenCalledOnce();
    expect(goBack).not.toHaveBeenCalled();

    expect(consumeTvRemoteBack({ pathname: "/media/4/", historyLength: 2, goBack, searchHandler })).toBe(true);
    expect(searchHandler).toHaveBeenCalledOnce();
    expect(goBack).toHaveBeenCalledOnce();
  });

  it("uses the in-app Home route for a cold deep link with no prior app entry", () => {
    const replace = vi.fn();
    const goBack = vi.fn();
    expect(consumeTvRemoteBack({ pathname: "/search/", historyLength: 3, backSteps: 0, replace, goBack })).toBe(true);
    expect(replace).toHaveBeenCalledWith("/");
    expect(goBack).not.toHaveBeenCalled();
  });

  it("does not let a hidden player handle Back from a catalog route", () => {
    const watchHandler = vi.fn(() => true);
    const goBack = vi.fn();
    expect(consumeTvRemoteBack({ pathname: "/media/4/", watchHandler, backSteps: 2, goBack })).toBe(true);
    expect(watchHandler).not.toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledWith(2);
  });

  it("does not go back on home so the native app can exit", () => {
    const goBack = vi.fn();
    expect(
      consumeTvRemoteBack({
        pathname: "/",
        historyLength: 4,
        goBack,
      }),
    ).toBe(false);
    expect(goBack).not.toHaveBeenCalled();
  });

  it("installs a window bridge the Android shell can call", () => {
    const goBack = vi.fn();
    vi.stubGlobal("history", { length: 3, back: goBack });
    vi.stubGlobal("location", { pathname: "/media/9/" });
    const uninstall = installTvRemoteBackBridge();
    expect(window.__mediaHandleBack?.()).toBe(true);
    expect(goBack).toHaveBeenCalledOnce();
    uninstall();
    expect(window.__mediaHandleBack).toBeUndefined();
  });

  it("does not go back when there is no in-app history", () => {
    const goBack = vi.fn();
    expect(
      consumeTvRemoteBack({
        pathname: "/media/9/",
        historyLength: 1,
        goBack,
      }),
    ).toBe(false);
    expect(goBack).not.toHaveBeenCalled();
  });
});

describe("TV application history", () => {
  const here = "https://media.test/reel/favorites/";
  const steps = (urls: string[], oldDocumentIndex = -1) => tvBackSteps({
    currentEntry: { index: urls.length - 1 },
    entries: () => urls.map((url, index) => ({ url, sameDocument: index !== oldDocumentIndex })),
  }, here, "/reel");

  it("returns to Search in one traversal despite leftover players", () => {
    expect(steps([
      "https://media.test/reel/search/?q=Dune",
      "https://media.test/reel/watch/movie/12/",
      "https://media.test/reel/watch/episode/45/",
      here,
    ])).toBe(3);
  });

  it("does not traverse into login, a different app on the host, or a different origin", () => {
    for (const other of ["https://media.test/reel/login/", "https://media.test/favorites/", "https://elsewhere.test/reel/"]) {
      expect(steps([other, here])).toBe(0);
    }
  });

  it("does not reload an older app document even when the URL is a valid app route", () => {
    expect(steps(["https://media.test/reel/", here], 0)).toBe(0);
  });

  it("skips the duplicate page left when the player replaces itself on exit", () => {
    expect(steps(["https://media.test/reel/", here, here])).toBe(2);
  });
});

describe("installTvWatchReentryGuard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips a leftover watch entry on popstate by going back again", () => {
    const replace = vi.fn();
    const goBack = vi.fn();
    const scheduled: Array<() => void> = [];
    let pathname = "/media/9/";
    let search = "";

    const uninstall = installTvWatchReentryGuard({
      replace,
      goBack,
      getLocation: () => ({ pathname, search }),
      getHistoryLength: () => 4,
      schedule: (fn) => scheduled.push(fn),
    });

    pathname = "/watch/movie/1/";
    search = "?media=9";
    window.dispatchEvent(new Event("popstate"));
    expect(goBack).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();

    pathname = "/";
    search = "";
    for (const fn of scheduled) fn();
    expect(replace).not.toHaveBeenCalled();

    uninstall();
  });

  it("replaces to the title page when Back cannot leave watch", () => {
    const replace = vi.fn();
    const goBack = vi.fn();
    let pathname = "/watch/episode/3/";
    let search = "?media=12";

    const uninstall = installTvWatchReentryGuard({
      replace,
      goBack,
      getLocation: () => ({ pathname, search }),
      getHistoryLength: () => 1,
      schedule: (fn) => fn(),
    });

    window.dispatchEvent(new Event("popstate"));
    expect(goBack).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/media/12/");

    uninstall();
  });

  it("replaces away if skipping Back still lands on watch", () => {
    const replace = vi.fn();
    const goBack = vi.fn();
    const scheduled: Array<() => void> = [];
    let pathname = "/watch/movie/1/";
    let search = "?media=9";

    const uninstall = installTvWatchReentryGuard({
      replace,
      goBack,
      getLocation: () => ({ pathname, search }),
      getHistoryLength: () => 3,
      schedule: (fn) => scheduled.push(fn),
    });

    window.dispatchEvent(new Event("popstate"));
    expect(goBack).toHaveBeenCalledOnce();

    // Still on a watch entry after the skip attempt.
    for (const fn of scheduled) fn();
    expect(replace).toHaveBeenCalledWith("/media/9/");

    uninstall();
  });
});
