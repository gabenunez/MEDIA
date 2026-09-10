import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeTvRemoteBack,
  installTvRemoteBackBridge,
  installTvWatchReentryGuard,
  isTvHomePath,
  isTvWatchPath,
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
