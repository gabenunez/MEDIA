import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeTvRemoteBack, installTvRemoteBackBridge, isTvHomePath } from "./tv-back";

describe("isTvHomePath", () => {
  it("treats /, trailing slashes, and empty as home", () => {
    expect(isTvHomePath("/")).toBe(true);
    expect(isTvHomePath("")).toBe(true);
    expect(isTvHomePath("/media/9/")).toBe(false);
    expect(isTvHomePath("/search/")).toBe(false);
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
