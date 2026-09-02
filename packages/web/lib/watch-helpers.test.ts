import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WATCH_CONTROLS_IDLE_MS,
  shouldScheduleWatchChromeHide,
  watchMenuOpen,
  nextFallbackQuality,
  resolveFallbackQuality,
} from "./watch-helpers.js";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("nextFallbackQuality", () => {
  it("steps down through the fallback order", () => {
    const available = ["original", "1080p", "720p", "480p"] as const;
    expect(nextFallbackQuality("original", [...available])).toBe("1080p");
    expect(nextFallbackQuality("1080p", [...available])).toBe("720p");
    expect(nextFallbackQuality("480p", [...available])).toBeNull();
  });

  it("skips tiers that are not available", () => {
    expect(
      nextFallbackQuality("original", ["original", "720p", "480p"]),
    ).toBe("720p");
  });
});

describe("resolveFallbackQuality", () => {
  const widescreen1080 = ["original", "480p", "720p", "1080p"] as const;

  it("steps from remux failure to source-matched transcode tier", () => {
    expect(
      resolveFallbackQuality(
        "original",
        [...widescreen1080],
        "remux",
        800,
        1920,
      ),
    ).toBe("1080p");
  });

  it("does not jump to 2160p after remux failure on 1080p sources", () => {
    const with4k = ["original", "480p", "720p", "1080p", "2160p"] as const;
    expect(
      resolveFallbackQuality(
        "original",
        [...with4k],
        "remux",
        800,
        1920,
      ),
    ).toBe("1080p");
  });

  it("skips duplicate 2160p when already transcoding at 2160p", () => {
    const with4k = ["original", "1080p", "720p", "480p", "2160p"] as const;
    expect(
      resolveFallbackQuality("original", [...with4k], "2160p", 2160, 3840),
    ).toBe("1080p");
  });
});

describe("watch chrome idle", () => {
  it("fades after 3 seconds of no movement", () => {
    expect(WATCH_CONTROLS_IDLE_MS).toBe(3_000);
  });

  it("treats subtitle and quality menus as open panels", () => {
    expect(watchMenuOpen({ subtitleMenuOpen: true })).toBe(true);
    expect(watchMenuOpen({ qualityMenuOpen: true })).toBe(true);
    expect(watchMenuOpen({ volumeMenuOpen: true })).toBe(true);
    expect(watchMenuOpen({ detailsOpen: true })).toBe(true);
    expect(watchMenuOpen({ subtitleAppearanceOpen: true })).toBe(true);
    expect(watchMenuOpen({ subtitleSearchOpen: true })).toBe(true);
    expect(watchMenuOpen({})).toBe(false);
  });

  it("does not schedule a hide while a submenu is open or paused", () => {
    expect(
      shouldScheduleWatchChromeHide({
        autoHideRequested: true,
        playing: true,
        panelOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldScheduleWatchChromeHide({
        autoHideRequested: true,
        playing: false,
        panelOpen: false,
      }),
    ).toBe(false);
    expect(
      shouldScheduleWatchChromeHide({
        autoHideRequested: true,
        playing: true,
        panelOpen: false,
      }),
    ).toBe(true);
  });

  it("desktop player uses the idle policy and does not close menus on hide", () => {
    const desktopWatch = readFileSync(
      path.join(webRoot, "app/watch/client.tsx"),
      "utf8",
    );
    expect(desktopWatch).toContain("WATCH_CONTROLS_IDLE_MS");
    expect(desktopWatch).toContain("watchMenuOpen");
    expect(desktopWatch).toContain("shouldScheduleWatchChromeHide");
    const reveal = desktopWatch.slice(
      desktopWatch.indexOf("const revealControls"),
      desktopWatch.indexOf("const setVolumeLevel"),
    );
    expect(reveal).not.toContain("setSubtitleMenuOpen(false)");
    expect(reveal).not.toContain("setQualityMenuOpen(false)");
    expect(reveal).not.toContain("}, 3000)");
  });

  it("TV player uses the same idle policy and does not close menus on hide", () => {
    const watchView = readFileSync(
      path.join(webRoot, "components/tv/views/watch-view.tsx"),
      "utf8",
    );
    expect(watchView).toContain("WATCH_CONTROLS_IDLE_MS");
    expect(watchView).toContain("shouldScheduleWatchChromeHide");
    expect(watchView).toContain("scheduleWatchChromeHide");
    expect(watchView).toContain("hideWatchChrome");
    const reveal = watchView.slice(
      watchView.indexOf("const revealControls"),
      watchView.indexOf("const applyNativePlaybackOverlayAlpha"),
    );
    expect(reveal).not.toContain("setSubtitleMenuOpen(false)");
    expect(reveal).not.toContain("setQualityMenuOpen(false)");
  });
});
