import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isWatchChromeFocusTarget,
  spatialNavShouldDeferToWatchPlayer,
  watchHiddenChromeArrowIntent,
} from "./tv-watch-remote";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("TV watch remote — hidden chrome", () => {
  it("defers D-pad to the player when watch is active and chrome is not focused", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        focusInsideWatchChrome: false,
      }),
    ).toBe(true);
  });

  it("lets spatial nav move between visible watch controls", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: true,
        focusInsideWatchChrome: true,
      }),
    ).toBe(false);
  });

  it("does not defer D-pad on catalog pages", () => {
    expect(
      spatialNavShouldDeferToWatchPlayer({
        watchPlayerActive: false,
        focusInsideWatchChrome: false,
      }),
    ).toBe(false);
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

  it("spatial nav defers to the watch player before stealing catalog focus", () => {
    const handler = spatialNav.slice(spatialNav.indexOf("function onKeyDown"));
    const deferAt = handler.indexOf("spatialNavShouldDeferToWatchPlayer");
    const stealAt = handler.indexOf('!active?.hasAttribute("data-tv-item")');
    expect(deferAt).toBeGreaterThan(-1);
    expect(stealAt).toBeGreaterThan(deferAt);
  });

  it("spatial nav defers horizontal skip keys while watch controls are focused", () => {
    expect(spatialNav).toContain('e.key === "MediaRewind"');
    expect(spatialNav).toContain("[data-tv-watch-menu]");
    expect(spatialNav).toContain("isWatchPlayerActive()");
  });

  it("watch view skips from hidden-arrow intent", () => {
    expect(watchView).toContain("watchHiddenChromeArrowIntent");
    expect(watchView).toContain('hiddenArrow === "skip-back"');
    expect(watchView).toContain('hiddenArrow === "skip-forward"');
  });

  it("skip uses live native playhead refs instead of stale React state", () => {
    expect(watchView).toContain("resolveSkipTargetAbsoluteSeconds");
    expect(watchView).toContain("usesNativePlayer ? currentTimeRef.current : currentTime");
  });

  it("handles rewind and fast-forward while transport controls are focused", () => {
    expect(watchView).toContain('e.key === "MediaRewind"');
    expect(watchView).toContain('e.key === "ArrowLeft"');
    expect(watchView).toContain("skipRelative(-10)");
    expect(watchView).toContain("skipRelative(30)");
  });

  it("clears optimistic seeks from the live native playhead", () => {
    expect(watchView).toContain("shouldClearOptimisticSeek");
    expect(watchView).toContain("optimisticAbsoluteSecondsRef.current = null");
  });
});
