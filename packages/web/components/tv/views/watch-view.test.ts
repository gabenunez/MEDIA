import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WATCH_SKIP_COALESCE_MS, WATCH_SKIP_FEEDBACK_MS } from "@/lib/tv-watch-player";
import { TvSpatialNav } from "../tv-spatial-nav";
import { TvWatchView } from "./watch-view";

vi.mock("next/navigation", () => {
  const router = { replace: vi.fn(), prefetch: vi.fn() };
  return {
    useRouter: () => router,
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(window.location.search),
  };
});

it("stacks remote skips and clears stale buffer data when committing a scrub", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const seekTo = vi.fn();
  const setWebOverlayAlpha = vi.fn();
  const raiseWebOverlay = vi.fn();
  vi.stubGlobal("MediaAndroid", { play: vi.fn(), seekTo, setWebOverlayAlpha, raiseWebOverlay });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  vi.spyOn(api, "getStreamInfo").mockResolvedValue({
    id: 42,
    type: "movie",
    mimeType: "video/mp4",
    fileSize: 1,
    fileName: "movie.mp4",
    isSymlink: false,
    durationMs: 600_000,
    videoCodec: "h264",
    audioCodec: "aac",
    availableQualities: ["original"],
    transcodingEnabled: false,
    directPlayAudioSupported: true,
    originalPlaybackMode: "direct",
    nativeTvPlaybackMode: "direct",
  });
  vi.spyOn(api, "listSubtitles").mockResolvedValue({
    tracks: [], opensubtitlesConfigured: false, wyzieConfigured: false,
  });
  const startingUrl = window.location.href;
  window.history.replaceState(null, "", "/watch/movie/42/");
  document.documentElement.setAttribute("data-tv-watch-active", "");
  const container = document.createElement("main");
  document.body.append(container);
  const root = createRoot(container);

  const press = (key: string) => act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  const report = (currentTime: number, isBuffering = false, buffered = 600) => act(async () => {
    window.__mediaNativePlayer?.onState?.({
      currentTime, duration: 600, buffered,
      isPlaying: !isBuffering, isBuffering, ready: true,
    });
  });
  const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
  const chrome = () => container.querySelector("[data-tv-watch-player]")?.getAttribute("data-tv-watch-chrome");
  const badge = () => container.querySelector("[data-tv-watch-skip-feedback]");

  try {
    await act(async () => root.render(createElement(TvSpatialNav, { children: createElement(TvWatchView) })));
    await report(125);
    expect(chrome(), container.textContent ?? "").toBe("visible");
    await press("Escape");
    await advance(120);
    expect(setWebOverlayAlpha).toHaveBeenLastCalledWith(0);
    raiseWebOverlay.mockClear();

    await press("ArrowRight");
    expect(chrome()).toBe("hidden");
    expect(badge()?.textContent).toContain("+30s");
    expect(raiseWebOverlay).toHaveBeenCalled();
    expect(seekTo.mock.calls).toEqual([[155_000]]);
    await advance(WATCH_SKIP_COALESCE_MS / 2);
    // More taps arrive before the native player reports its new position.
    await report(125, true);
    await press("ArrowRight");
    expect(badge()?.textContent).toContain("+60s");
    await press("ArrowRight");
    expect(chrome()).toBe("hidden");
    expect(badge()?.textContent).toContain("+90s");
    await advance(WATCH_SKIP_COALESCE_MS / 2);
    expect(seekTo.mock.calls).toEqual([[155_000]]);
    await advance(WATCH_SKIP_COALESCE_MS / 2);
    expect(seekTo.mock.calls).toEqual([[155_000], [215_000]]);
    await report(215);
    await advance(WATCH_SKIP_FEEDBACK_MS);
    expect(badge()).toBeNull();

    // Each press clamps at the edge; reversing immediately starts from zero.
    await report(5);
    await press("ArrowLeft");
    expect(badge()?.textContent).toContain("−5s");
    expect(seekTo).toHaveBeenLastCalledWith(0);
    await press("ArrowLeft");
    expect(badge()?.textContent).toContain("−5s");
    await press("ArrowRight");
    expect(badge()?.textContent).toContain("+30s");
    await advance(WATCH_SKIP_COALESCE_MS);
    expect(seekTo).toHaveBeenLastCalledWith(30_000);

    await report(30);
    await advance(WATCH_SKIP_FEEDBACK_MS);
    await report(595);
    await press("ArrowRight");
    expect(badge()?.textContent).toContain("+5s");
    expect(seekTo).toHaveBeenLastCalledWith(600_000);
    await advance(WATCH_SKIP_COALESCE_MS);
    expect(seekTo).toHaveBeenCalledTimes(5);

    await press("ArrowUp");
    expect(chrome()).toBe("visible");
    expect(badge()).toBeNull();
    await advance(50);
    await press("ArrowRight");
    expect(container.querySelector("[data-tv-focused]")?.getAttribute("aria-label"))
      .toBe("Forward 30 seconds");
    await advance(WATCH_SKIP_COALESCE_MS);
    expect(seekTo).toHaveBeenCalledTimes(5);

    // An OK press on the scrubber clears the old range before ExoPlayer responds.
    await report(600);
    await report(120, false, 145);
    const bufferBar = () => container.querySelector<HTMLElement>(".watch-scrub-buffer");
    expect(bufferBar()?.style.left).toBe("20%");
    await press("ArrowUp");
    for (let i = 0; i < 4; i++) await press("ArrowRight");
    expect(bufferBar()?.style.left).toBe("20%");
    await press("Enter");
    expect(seekTo.mock.lastCall?.[0]).toBeCloseTo(160_000);
    expect(bufferBar()).toBeNull();
    await report(120, false, 145);
    expect(bufferBar()).toBeNull();
    await report(160, true, 170);
    expect(bufferBar()).toBeNull();
    await report(160, false, 190);
    expect(parseFloat(bufferBar()?.style.left ?? "")).toBeCloseTo(160 / 600 * 100);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.removeAttribute("data-tv-watch-active");
    window.history.replaceState(null, "", startingUrl);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
