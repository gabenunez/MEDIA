import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dispatchWatchRemoteKey,
  getWatchPlayerFocusedItem,
  isWatchChromeFocusTarget,
  isWatchDedicatedSkipKey,
  isWatchTextInputKeyTarget,
  nativeWebOverlayAlpha,
  spatialNavShouldDeferToWatchPlayer,
  TV_WATCH_REMOTE_KEY_EVENT,
  watchHiddenChromeArrowIntent,
  watchVisibleTransportArrowIntent,
} from "./tv-watch-remote";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("TV watch remote — hidden chrome", () => {
  it("defers D-pad to the player whenever watch is active, except menus", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        inWatchMenu: false,
      }),
    ).toBe(true);
  });

  it("lets spatial nav move inside subtitle/quality menus", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        inWatchMenu: true,
      }),
    ).toBe(false);
  });

  it("does not defer D-pad on catalog pages", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: false,
        inWatchMenu: false,
      }),
    ).toBe(false);
  });

  it("prefers the visual TV focus ring inside the player", () => {
    document.body.innerHTML = `
      <div data-tv-watch-player>
        <button id="play" data-tv-item data-tv-focused></button>
      </div>
    `;
    expect(getWatchPlayerFocusedItem()?.id).toBe("play");
    document.body.innerHTML = "";
  });

  it("treats the control bar and side menus as watch chrome", () => {
    document.body.innerHTML = `
      <div data-tv-watch-player>
        <button id="play" data-tv-watch-controls></button>
        <div data-tv-watch-menu><button id="track"></button></div>
      </div>
      <a id="home" data-tv-item>Home</a>
    `;
    expect(isWatchChromeFocusTarget(document.getElementById("play"))).toBe(true);
    expect(isWatchChromeFocusTarget(document.getElementById("track"))).toBe(true);
    expect(isWatchChromeFocusTarget(document.getElementById("home"))).toBe(false);
    expect(isWatchChromeFocusTarget(null)).toBe(false);
    document.body.innerHTML = "";
  });

  it("redispatches consumed D-pad keys to the watch player", () => {
    const keys: string[] = [];
    const onKey = (event: Event) => {
      keys.push((event as CustomEvent<{ key: string }>).detail.key);
    };
    window.addEventListener(TV_WATCH_REMOTE_KEY_EVENT, onKey);
    dispatchWatchRemoteKey("ArrowUp");
    window.removeEventListener(TV_WATCH_REMOTE_KEY_EVENT, onKey);
    expect(keys).toEqual(["ArrowUp"]);
  });

  it("does not treat window-targeted key events as text inputs", () => {
    expect(isWatchTextInputKeyTarget(window)).toBe(false);
    expect(isWatchTextInputKeyTarget(document)).toBe(false);
    expect(isWatchTextInputKeyTarget(null)).toBe(false);
  });

  it("keeps D-pad in a real text field", () => {
    document.body.innerHTML = `<input id="q" /><button id="go" data-tv-item></button>`;
    expect(isWatchTextInputKeyTarget(document.getElementById("q"))).toBe(true);
    expect(isWatchTextInputKeyTarget(document.getElementById("go"))).toBe(false);
    document.body.innerHTML = "";
  });

  it("skips immediately on horizontal arrows while controls are hidden", () => {
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowDown",
        showTransportControls: true,
      }),
    ).toBe("reveal-play");
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowUp",
        showTransportControls: true,
      }),
    ).toBe("reveal-play");
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowLeft",
        showTransportControls: true,
      }),
    ).toBe("skip-back");
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowRight",
        showTransportControls: true,
      }),
    ).toBe("skip-forward");
    expect(
      watchHiddenChromeArrowIntent({
        key: "MediaRewind",
        showTransportControls: true,
      }),
    ).toBe("skip-back");
  });

  it("still reveals on Up/Down before transport chrome is mounted, and does not skip", () => {
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowLeft",
        showTransportControls: false,
      }),
    ).toBeNull();
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowUp",
        showTransportControls: false,
      }),
    ).toBe("reveal-play");
    expect(
      watchHiddenChromeArrowIntent({
        key: "ArrowDown",
        showTransportControls: false,
      }),
    ).toBe("reveal-play");
  });

  it("moves between visible transport buttons instead of skipping on D-pad", () => {
    expect(watchVisibleTransportArrowIntent("ArrowLeft")).toBe("move-focus");
    expect(watchVisibleTransportArrowIntent("ArrowRight")).toBe("move-focus");
    expect(watchVisibleTransportArrowIntent("MediaRewind")).toBe("skip-back");
    expect(watchVisibleTransportArrowIntent("MediaFastForward")).toBe("skip-forward");
    expect(watchVisibleTransportArrowIntent("ArrowUp")).toBeNull();
    expect(isWatchDedicatedSkipKey("ArrowLeft")).toBe(false);
    expect(isWatchDedicatedSkipKey("MediaRewind")).toBe(true);
  });
});

describe("TV native WebView overlay", () => {
  it("keeps the overlay raised when chrome is already visible", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: true,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: false,
      }),
    ).toBe(1);
  });

  it("does not drop the overlay at native playback start while chrome is showing", () => {
    // Regression: startNativePlayback used to call setNativeWebOverlayAlpha(0)
    // even though showControls starts true and stays true until Back. Alpha 0
    // puts ExoPlayer in front, so the control bar never appears.
    const overlayAtPlaybackStart = nativeWebOverlayAlpha({
      controlsVisible: true,
      blockingOverlayVisible: false,
      showMidPlaybackBuffering: false,
    });
    expect(overlayAtPlaybackStart).toBe(1);
    expect(overlayAtPlaybackStart).not.toBe(0);
  });

  it("lowers the overlay only when chrome, errors, and mid-play buffering are gone", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: false,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: false,
      }),
    ).toBe(0);
  });

  it("raises the overlay for error/countdown screens", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: false,
        blockingOverlayVisible: true,
        showMidPlaybackBuffering: false,
      }),
    ).toBe(1);
  });

  it("raises the overlay for mid-playback buffering chrome", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: false,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: true,
      }),
    ).toBe(1);
  });

  it("raises the overlay while remote skip feedback is visible", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: false,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: false,
        skipFeedbackVisible: true,
      }),
    ).toBe(1);
  });

  it("keeps overlay and chrome in lockstep through start, hide, and reveal", () => {
    let showControls = true;
    const overlayFor = () =>
      nativeWebOverlayAlpha({
        controlsVisible: showControls,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: false,
      });

    expect(overlayFor()).toBe(1);

    // Native playback start must not drop the overlay while chrome is up.
    expect(overlayFor()).toBe(1);

    showControls = false;
    expect(overlayFor()).toBe(0);

    showControls = true;
    expect(overlayFor()).toBe(1);
  });
});

describe("TV watch remote — wiring (do not revert)", () => {
  const spatialNav = readFileSync(
    path.join(webRoot, "components/tv/tv-spatial-nav.tsx"),
    "utf8",
  );
  const watchView = readFileSync(
    path.join(webRoot, "components/tv/views/watch-view.tsx"),
    "utf8",
  );
  const mediaView = readFileSync(
    path.join(webRoot, "components/tv/views/media-view.tsx"),
    "utf8",
  );

  it("spatial nav defers to the watch player before stealing catalog focus", () => {
    const handler = spatialNav.slice(spatialNav.indexOf("function onKeyDown"));
    const deferAt = handler.indexOf("spatialNavShouldDeferToWatchPlayer");
    const stealAt = handler.indexOf('!active?.hasAttribute("data-tv-item")');
    expect(deferAt).toBeGreaterThan(-1);
    expect(stealAt).toBeGreaterThan(deferAt);
    const deferBlock = handler.slice(deferAt, stealAt);
    expect(deferBlock).toContain("preventDefault");
    expect(deferBlock).toContain("stopPropagation");
    expect(deferBlock).toContain("dispatchWatchRemoteKey");
  });

  it("spatial nav defers player transport D-pad to watch-view", () => {
    expect(spatialNav).not.toContain("isWatchHorizontalSkipKey");
    expect(spatialNav).toContain("spatialNavShouldHandleWatchArrow");
    expect(spatialNav).toContain("isWatchPlayerActive()");
    expect(spatialNav).toContain("inWatchMenu");
    expect(spatialNav).toContain("getWatchPlayerFocusedItem");
    expect(watchView).toContain("moveWatchTransportFocus");
  });

  it("spatial nav does not click the scrubber on Enter — watch-view commits the seek", () => {
    const enterBlock = spatialNav.slice(
      spatialNav.indexOf("if (isEnter)"),
      spatialNav.indexOf("const target = e.target"),
    );
    expect(enterBlock).toContain("data-tv-watch-scrub");
    expect(enterBlock.indexOf("data-tv-watch-scrub")).toBeLessThan(
      enterBlock.indexOf("active.click()"),
    );
  });

  it("watch view skips from hidden-arrow intent", () => {
    expect(watchView).toContain("watchHiddenChromeArrowIntent");
    expect(watchView).toContain("watchSkipDeltaSeconds");
  });

  it("skip uses live native playhead refs instead of stale React state", () => {
    expect(watchView).toContain("resolveSkipTargetAbsoluteSeconds");
    expect(watchView).toContain("usesNativePlayer ? currentTimeRef.current : currentTime");
  });

  it("handles dedicated rewind/fast-forward while transport controls are focused", () => {
    expect(watchView).toContain("watchVisibleTransportArrowIntent");
    expect(watchView).toContain("watchSkipDeltaSeconds");
  });

  it("commits the scrub preview on OK/click instead of only revealing chrome", () => {
    expect(watchView).toContain("commitScrubPreview");
    expect(watchView).toContain("resolveScrubCommitDecision");
    expect(watchView).toContain("progressRef.current = optimisticProgressPercent ?? progress");
    expect(watchView).not.toContain("progressRef.current = displayedProgress");
    const scrubButton = watchView.slice(
      watchView.indexOf("data-tv-watch-scrub="),
      watchView.indexOf("className=\"absolute inset-x-0 top-1/2"),
    );
    expect(scrubButton).toContain("commitScrubPreview()");
    expect(scrubButton).not.toContain("revealControls(false)");
  });

  it("clears optimistic seeks from the live native playhead", () => {
    expect(watchView).toContain("shouldClearOptimisticSeek");
    expect(watchView).toContain("optimisticAbsoluteSecondsRef.current = null");
  });

  it("syncs native overlay alpha from chrome visibility instead of forcing 0 at start", () => {
    const startIdx = watchView.indexOf("startNativePlayback({");
    expect(startIdx).toBeGreaterThan(-1);
    const beforeStart = watchView.slice(Math.max(0, startIdx - 250), startIdx);
    expect(beforeStart).not.toMatch(/setNativeWebOverlayAlpha\(\s*0\s*\)/);
    expect(watchView).toContain("nativeWebOverlayAlpha({");
    expect(watchView).toContain("nativeWebOverlayShouldRaise({");
  });

  it("native TV app injects D-pad into JS for the whole native playback session", () => {
    const mainActivity = readFileSync(
      path.join(webRoot, "../android-tv/app/src/main/java/com/media/app/MainActivity.kt"),
      "utf8",
    );
    expect(mainActivity).toContain("WatchRemoteKeys.webKeyName");
    expect(mainActivity).toContain("WatchRemoteKeys.shouldInjectDpad");
    expect(mainActivity).toContain("nativePlayer.isActive()");
    expect(mainActivity).toContain("WatchRemoteKeys.dispatchScript");
    expect(mainActivity).not.toContain("shouldInjectDpad(nativePlayer.isActive(), webOverlayInFront)");
    expect(spatialNav).toContain("isWatchTextInputKeyTarget");
    const keys = readFileSync(
      path.join(webRoot, "../android-tv/app/src/main/java/com/media/app/WatchRemoteKeys.kt"),
      "utf8",
    );
    expect(keys).toContain("window.dispatchEvent");
    expect(keys).not.toContain("document.activeElement");
  });

  it("raises the native overlay inside revealControls even when chrome is already showing", () => {
    const reveal = watchView.slice(
      watchView.indexOf("const revealControls"),
      watchView.indexOf("const updateBufferedPosition"),
    );
    expect(reveal).toContain("setNativeWebOverlayAlpha(1, true)");
    expect(reveal).toContain("showControlsRef.current = true");
  });

  it("offers Start from beginning on TV media pages and in the player", () => {
    expect(mediaView).toContain("START_FROM_BEGINNING_LABEL");
    expect(mediaView).toContain("watchFromStart");
    expect(mediaView).toContain("movieCanResume");
    expect(mediaView).toContain("episodeCanResume");
    expect(watchView).toContain("resolveWatchInitialResumeSeconds");
    expect(watchView).toContain("restartFromBeginning");
    expect(watchView).toContain("fromStart");
    expect(watchView).toContain("RotateCcw");
  });
});
