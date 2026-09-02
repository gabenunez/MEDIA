import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dispatchWatchRemoteKey,
  getOpenWatchMenu,
  getWatchPlayerFocusedItem,
  getWatchTransportFocusItems,
  isWatchChromeFocusTarget,
  isWatchDedicatedSkipKey,
  isWatchPlayerChromeVisible,
  isWatchTextInputKeyTarget,
  nativeWebOverlayAlpha,
  nativeOverlayRaiseMustReassertZOrder,
  resolveWatchMenuDpadTarget,
  shouldExposeNativeVideoSurface,
  shouldRetargetWatchMenuDpad,
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

  it("defers D-pad even when a transport button is focused — catalog nav must not run", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        inWatchMenu: false,
      }),
    ).toBe(true);
    document.body.innerHTML = `
      <div data-tv-watch-player>
        <div data-tv-content-row data-tv-watch-transport-row>
          <button id="play" data-tv-item data-tv-focused data-tv-watch-controls></button>
        </div>
      </div>
    `;
    const play = document.getElementById("play");
    expect(isWatchChromeFocusTarget(play)).toBe(true);
    expect(getWatchPlayerFocusedItem()?.id).toBe("play");
    expect(watchVisibleTransportArrowIntent("ArrowLeft")).toBe("move-focus");
    expect(watchVisibleTransportArrowIntent("ArrowRight")).toBe("move-focus");
    document.body.innerHTML = "";
  });

  it("lets spatial nav move inside subtitle/quality menus", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        inWatchMenu: true,
      }),
    ).toBe(false);
  });

  it("still defers Up/Down to the player when chrome is hidden, even if a menu node exists", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        inWatchMenu: true,
        chromeVisible: false,
      }),
    ).toBe(true);
    expect(
      shouldRetargetWatchMenuDpad({
        chromeVisible: false,
        inWatchMenu: true,
        retargeted: true,
      }),
    ).toBe(false);
  });

  it("reads chrome visibility from data-tv-watch-chrome", () => {
    document.body.innerHTML = `
      <div data-tv-watch-player data-tv-watch-chrome="hidden">
        <div data-tv-watch-menu><button id="stale" data-tv-item></button></div>
      </div>
    `;
    expect(isWatchPlayerChromeVisible()).toBe(false);
    expect(getOpenWatchMenu()).not.toBeNull();
    document.body.innerHTML = `
      <div data-tv-watch-player data-tv-watch-chrome="visible">
        <button data-tv-watch-controls data-tv-item>Play</button>
      </div>
    `;
    expect(isWatchPlayerChromeVisible()).toBe(true);
    document.body.innerHTML = "";
  });

  it("retargets D-pad into a menu only while chrome is visible", () => {
    expect(
      shouldRetargetWatchMenuDpad({
        chromeVisible: true,
        inWatchMenu: true,
        retargeted: true,
      }),
    ).toBe(true);
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

  it("retargets D-pad into an open subtitle menu when the opener still has the focus ring", () => {
    document.body.innerHTML = `
      <div data-tv-watch-player>
        <div data-tv-watch-controls data-tv-watch-transport-row>
          <button id="play" data-tv-item></button>
          <button id="subs" data-tv-item data-tv-focused></button>
          <div data-tv-watch-menu>
            <div data-tv-content-row data-tv-row data-tv-vertical>
              <button id="off" data-tv-item>Off</button>
              <div data-tv-row data-tv-subtitle-track-row>
                <button id="en" data-tv-item data-tv-subtitle-track>English</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const opener = document.getElementById("subs");
    expect(getOpenWatchMenu()).not.toBeNull();
    expect(getWatchPlayerFocusedItem()?.id).toBe("subs");
    const resolved = resolveWatchMenuDpadTarget(opener);
    expect(resolved.inWatchMenu).toBe(true);
    expect(resolved.retargeted).toBe(true);
    expect(resolved.active?.id).toBe("off");
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        inWatchMenu: resolved.inWatchMenu,
      }),
    ).toBe(false);
    document.body.innerHTML = "";
  });

  it("does not retarget D-pad when no player submenu is open", () => {
    document.body.innerHTML = `
      <div data-tv-watch-player>
        <button id="play" data-tv-item data-tv-focused></button>
      </div>
    `;
    const play = document.getElementById("play");
    const resolved = resolveWatchMenuDpadTarget(play);
    expect(resolved.inWatchMenu).toBe(false);
    expect(resolved.retargeted).toBe(false);
    expect(resolved.active?.id).toBe("play");
    document.body.innerHTML = "";
  });

  it("keeps D-pad on a menu row that already has the focus ring", () => {
    document.body.innerHTML = `
      <div data-tv-watch-menu>
        <div data-tv-content-row>
          <button id="off" data-tv-item>Off</button>
          <button id="en" data-tv-item data-tv-focused>English</button>
        </div>
      </div>
    `;
    const en = document.getElementById("en");
    expect(getWatchPlayerFocusedItem()?.id).toBe("en");
    const resolved = resolveWatchMenuDpadTarget(en);
    expect(resolved.inWatchMenu).toBe(true);
    expect(resolved.retargeted).toBe(false);
    expect(resolved.active?.id).toBe("en");
    document.body.innerHTML = "";
  });

  it("omits nested submenu rows from transport left/right targets", () => {
    document.body.innerHTML = `
      <div data-tv-watch-transport-row>
        <button id="play" data-tv-item></button>
        <button id="subs" data-tv-item></button>
        <div data-tv-watch-menu>
          <button id="off" data-tv-item></button>
        </div>
      </div>
    `;
    const row = document.querySelector("[data-tv-watch-transport-row]");
    expect(getWatchTransportFocusItems(row).map((el) => el.id)).toEqual([
      "play",
      "subs",
    ]);
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

  it("keeps the overlay raised until native playback has begun", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: false,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: false,
        nativePlaybackBegun: false,
      }),
    ).toBe(1);
  });

  it("does not cover a playing native surface when chrome is hidden after playback has begun", () => {
    expect(
      nativeWebOverlayAlpha({
        controlsVisible: false,
        blockingOverlayVisible: false,
        showMidPlaybackBuffering: false,
        nativePlaybackBegun: true,
      }),
    ).toBe(0);
  });

  it("does not expose the native surface on buffered-only samples", () => {
    expect(
      shouldExposeNativeVideoSurface({
        isPlaying: false,
        ready: false,
        isBuffering: true,
      }),
    ).toBe(false);
    expect(
      shouldExposeNativeVideoSurface({
        isPlaying: false,
        ready: true,
        isBuffering: true,
      }),
    ).toBe(false);
    expect(
      shouldExposeNativeVideoSurface({
        isPlaying: true,
        ready: true,
        isBuffering: false,
      }),
    ).toBe(true);
    expect(
      shouldExposeNativeVideoSurface({
        isPlaying: false,
        ready: true,
        isBuffering: false,
      }),
    ).toBe(true);
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

  it("re-asserts WebView z-order when last overlay alpha is already 1", () => {
    expect(nativeOverlayRaiseMustReassertZOrder(1)).toBe(true);
    expect(nativeOverlayRaiseMustReassertZOrder(0)).toBe(false);
    expect(nativeOverlayRaiseMustReassertZOrder(null)).toBe(false);
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
  const tvShell = readFileSync(
    path.join(webRoot, "components/tv/tv-shell.tsx"),
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
    expect(deferBlock).toContain("stopImmediatePropagation");
    expect(deferBlock).toContain("dispatchWatchRemoteKey");
  });

  it("spatial nav defers player transport D-pad to watch-view", () => {
    expect(spatialNav).not.toContain("isWatchHorizontalSkipKey");
    expect(spatialNav).toContain("spatialNavShouldHandleWatchArrow");
    expect(spatialNav).toContain("isWatchPlayerActive()");
    expect(spatialNav).toContain("inWatchMenu");
    expect(spatialNav).toContain("getWatchPlayerFocusedItem");
    expect(spatialNav).toContain("resolveWatchMenuDpadTarget");
    expect(spatialNav).toContain("isWatchPlayerChromeVisible");
    expect(spatialNav).toContain("shouldRetargetWatchMenuDpad");
    expect(spatialNav).toContain("chromeVisible");
    expect(watchView).toContain("moveWatchTransportFocus");
    expect(watchView).toContain("getWatchTransportFocusItems");
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
    expect(scrubButton).toContain("onClick={() => {");
    expect(scrubButton).toContain("commitScrubPreview()");
    expect(scrubButton).not.toContain("revealControls(false)");
  });

  it("discards the scrub preview on blur and chrome hide — Back must not seek", () => {
    const scrubButton = watchView.slice(
      watchView.indexOf("data-tv-watch-scrub="),
      watchView.indexOf("className=\"absolute inset-x-0 top-1/2"),
    );
    expect(scrubButton).toContain("onBlur={() => {");
    expect(scrubButton).toContain("discardScrubPreview()");
    expect(scrubButton).not.toMatch(/onBlur=\{\(\) => \{[\s\S]*commitScrubPreview/);
    const hideChrome = watchView.slice(
      watchView.indexOf("const hideWatchChrome"),
      watchView.indexOf("const scheduleWatchChromeHide"),
    );
    expect(hideChrome).toContain("discardScrubPreview()");
  });

  it("clears optimistic seeks from the live native playhead", () => {
    expect(watchView).toContain("shouldClearOptimisticSeek");
    expect(watchView).toContain("optimisticAbsoluteSecondsRef.current = null");
  });

  it("syncs native overlay alpha from chrome visibility instead of forcing 0 at start", () => {
    const starts = [...watchView.matchAll(/startNativePlayback\(\{/g)];
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const match of starts) {
      const after = watchView.slice(match.index ?? 0, (match.index ?? 0) + 1200);
      expect(after).toContain("applyNativePlaybackOverlayAlpha()");
      expect(after).not.toMatch(/setNativeWebOverlayAlpha\(\s*0\s*\)/);
    }
    expect(watchView).toContain("nativeWebOverlayAlpha({");
    expect(watchView).toContain("nativePlaybackBegun: playbackHasBegunRef.current");
    expect(watchView).toContain("raiseNativeWebOverlay()");
    expect(watchView).toContain("nativeWebOverlayShouldRaise({");
    expect(watchView).toContain("nativePlaybackBegun:");
    expect(watchView).toContain("shouldExposeNativeVideoSurface");
    expect(watchView).toContain('data-tv-watch-chrome={controlsVisible ? "visible" : "hidden"}');
    expect(watchView).not.toContain("state.buffered > 0.5");
  });

  it("native TV app injects D-pad into JS on every screen, not only during playback", () => {
    const mainActivity = readFileSync(
      path.join(webRoot, "../android-tv/app/src/main/java/com/media/app/MainActivity.kt"),
      "utf8",
    );
    expect(mainActivity).toContain("WatchRemoteKeys.webKeyName");
    expect(mainActivity).toContain("WatchRemoteKeys.shouldInjectDpad()");
    expect(mainActivity).not.toContain("shouldInjectDpad(nativePlayer.isActive())");
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
    expect(reveal).toContain("raiseNativeWebOverlay()");
    expect(reveal).toContain("showControlsRef.current = true");
  });

  it("shows chrome and re-raises the overlay on every new title", () => {
    const reset = watchView.slice(
      watchView.indexOf("nativePlaySessionRef.current = 0"),
      watchView.indexOf("}, [fileId, type, usesNativePlayer]"),
    );
    expect(reset).toContain("setShowControls(true)");
    expect(reset).toContain("showControlsRef.current = true");
    expect(reset).toContain('pendingRevealFocusRef.current = "play"');
    expect(reset).toContain("raiseNativeWebOverlay()");
    expect(reset).toContain("setIsPlaying(false)");
    expect(tvShell).toContain("raiseNativeWebOverlay()");
    const mainActivity = readFileSync(
      path.join(webRoot, "../android-tv/app/src/main/java/com/media/app/MainActivity.kt"),
      "utf8",
    );
    expect(mainActivity).toContain("NativeWebOverlay.shouldBringWebViewToFront");
    expect(mainActivity).toContain("fun raiseWebOverlay()");
    expect(mainActivity).not.toContain("if (clamped == lastWebOverlayAlpha) return");
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
