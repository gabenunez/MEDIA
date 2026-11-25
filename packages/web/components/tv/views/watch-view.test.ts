import { act, createElement } from "react";
import type { MediaChapter } from "@media-app/shared";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WATCH_SKIP_COALESCE_MS, WATCH_SKIP_FEEDBACK_MS } from "@/lib/tv-watch-player";
import { WATCH_HOLD_SCRUB_DELAY_MS } from "@/lib/use-watch-hold-scrub";
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

vi.mock("@/lib/use-seek-thumbnails", () => ({
  useSeekThumbnails: () => ({
    thumbnails: { spriteUrl: "/seek-sprite.jpg" },
    lookupCue: (timeMs: number) => ({
      x: Math.floor(timeMs / 10_000) * 160, y: 0, width: 160, height: 90,
    }),
  }),
}));

function nativeWatchHarness(chapters?: MediaChapter[]) {
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
    chapters,
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
  const remoteKey = (type: "keydown" | "keyup", key: string, flags = { repeat: false, canceled: false }) =>
    act(async () => {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, repeat: flags.repeat });
      window.dispatchEvent(Object.assign(event, {
        mediaRemoteTracksRelease: true,
        mediaRemoteCanceled: flags.canceled,
      }));
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
  const hold = () => container.querySelector<HTMLElement>("[data-tv-watch-hold-scrub]");
  const mount = () => act(async () =>
    root.render(createElement(TvSpatialNav, { children: createElement(TvWatchView) })),
  );
  const dispose = async () => {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.removeAttribute("data-tv-watch-active");
    window.history.replaceState(null, "", startingUrl);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  };
  return { container, press, remoteKey, report, advance, chrome, badge, hold, seekTo, setWebOverlayAlpha, raiseWebOverlay, mount, dispose };
}

it("stacks remote skips and clears stale buffer data when committing a scrub", async () => {
  const { container, press, report, advance, chrome, badge, seekTo, setWebOverlayAlpha, raiseWebOverlay, mount, dispose } =
    nativeWatchHarness();
  try {
    await mount();
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
    await dispose();
  }
});

it("opens TV chapters at the current chapter and selects with the D-pad", async () => {
  const { mount, dispose, container, press, advance, report, seekTo } = nativeWatchHarness([
    { title: "Opening", startMs: 0 },
    { title: "Crossing the river", startMs: 120_000 },
    { title: "The return", startMs: 333_500 },
  ]);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  try {
    await mount();
    await report(125);
    await advance(60);
    const focused = () => container.querySelector("[data-tv-focused]");
    expect(container.querySelectorAll(".watch-chapter-marker")).toHaveLength(2);
    await press("ArrowRight");
    await press("ArrowRight");
    expect(focused()?.textContent).toContain("Chapters");
    await press("Enter");
    const panel = () => container.querySelector("[data-watch-chapters]");
    expect(panel()?.querySelector('[aria-current="step"]')?.textContent).toContain("Crossing the river");
    expect(focused()?.textContent).toContain("Crossing the river");
    await press("ArrowDown");
    expect(focused()?.textContent).toContain("The return");
    await press("Enter");
    expect(seekTo.mock.calls).toEqual([[333_500]]);
    expect(panel()).toBeNull();
    await advance(60);
    expect(focused()?.textContent).toContain("Chapters");
    await press("Enter");
    expect(focused()?.textContent).toContain("The return");
    await act(async () => { expect(window.__mediaWatchHandleBack?.()).toBe(true); });
    await advance(60);
    expect(panel()).toBeNull();
    expect(focused()?.textContent).toContain("Chapters");
  } finally {
    await dispose();
  }
});

it("distinguishes a tap from a hold, accelerates the thumbnail, and seeks once on release", async () => {
  const { mount, dispose, press, remoteKey, advance, report, seekTo, hold, chrome, badge, raiseWebOverlay } =
    nativeWatchHarness();
  try {
    await mount();
    await report(125);
    await press("Escape");
    await advance(120);

    await remoteKey("keydown", "ArrowRight");
    await advance(80);
    expect(hold()).toBeNull();
    expect(seekTo).not.toHaveBeenCalled();
    await remoteKey("keyup", "ArrowRight");
    expect(seekTo.mock.calls).toEqual([[155_000]]);
    expect(badge()?.textContent).toContain("+30s");
    await report(155);
    await advance(WATCH_SKIP_FEEDBACK_MS);
    raiseWebOverlay.mockClear();

    await remoteKey("keydown", "ArrowRight");
    await advance(WATCH_HOLD_SCRUB_DELAY_MS - 1);
    expect(hold()).toBeNull();
    await remoteKey("keydown", "ArrowRight", { repeat: true, canceled: false });
    await advance(1);
    expect(hold()?.textContent).toContain("Fast forward");
    expect(hold()?.textContent).toContain("2:45");
    expect(hold()?.querySelector('[style*="seek-sprite.jpg"]')).not.toBeNull();
    expect(raiseWebOverlay).toHaveBeenCalled();
    const thumbnail = () => hold()?.querySelector<HTMLElement>('[style*="seek-sprite.jpg"]')?.style.backgroundPosition;
    const firstThumbnail = thumbnail();
    await advance(1000);
    expect(hold()?.textContent).toContain("3:15");
    expect(thumbnail()).not.toBe(firstThumbnail);
    await advance(1500);
    expect(hold()?.textContent).toContain("5:30");
    expect(chrome()).toBe("hidden");
    expect(seekTo.mock.calls).toEqual([[155_000]]);

    await remoteKey("keyup", "ArrowRight");
    expect(hold()).toBeNull();
    expect(seekTo.mock.calls).toEqual([[155_000], [330_000]]);
    await remoteKey("keyup", "ArrowRight");
    expect(seekTo).toHaveBeenCalledTimes(2);
  } finally {
    await dispose();
  }
});

it("lets Back and canceled releases discard a hold and clamps a rewind at zero", async () => {
  const { mount, dispose, press, remoteKey, advance, report, seekTo, hold } = nativeWatchHarness();
  try {
    await mount();
    await report(5);
    await press("Escape");
    await remoteKey("keydown", "ArrowLeft");
    await advance(WATCH_HOLD_SCRUB_DELAY_MS);
    expect(hold()?.textContent).toContain("Rewind");
    expect(hold()?.textContent).toContain("0:00");

    // Android Back goes through the watch handler rather than a DOM keydown.
    await act(async () => { expect(window.__mediaWatchHandleBack?.()).toBe(true); });
    expect(hold()).toBeNull();
    await remoteKey("keyup", "ArrowLeft");
    expect(seekTo).not.toHaveBeenCalled();

    await remoteKey("keydown", "ArrowLeft");
    await advance(WATCH_HOLD_SCRUB_DELAY_MS);
    await remoteKey("keyup", "ArrowLeft", { repeat: false, canceled: true });
    expect(hold()).toBeNull();
    expect(seekTo).not.toHaveBeenCalled();

    await remoteKey("keydown", "ArrowLeft");
    await advance(WATCH_HOLD_SCRUB_DELAY_MS);
    await remoteKey("keyup", "ArrowLeft");
    expect(seekTo.mock.calls).toEqual([[0]]);
    expect(hold()).toBeNull();
    await report(0);
    await remoteKey("keydown", "ArrowLeft");
    await advance(WATCH_HOLD_SCRUB_DELAY_MS);
    await remoteKey("keyup", "ArrowLeft");
    expect(seekTo.mock.calls).toEqual([[0]]);
  } finally {
    await dispose();
  }
});
