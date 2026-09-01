import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WATCH_SKIP_BACK_SECONDS,
  WATCH_SKIP_FORWARD_SECONDS,
  clampAbsoluteSeekSeconds,
  isWatchBackKey,
  isWatchConfirmKey,
  nudgeScrubPreviewPercent,
  resolveScrubCommitDecision,
  resolveTvSeekPlan,
  resolveWatchBackAction,
  spatialNavShouldHandleWatchArrow,
  watchChromeVerticalArrowIntent,
  watchMediaKeyIntent,
  watchScrubKeyIntent,
  watchScrubNudgeStepPercent,
  watchSkipDeltaSeconds,
  accumulateWatchSkipFeedback,
  isWatchRemoteSkipArrowKey,
  WATCH_SKIP_FEEDBACK_MS,
} from "./tv-watch-player";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("watch skip amounts", () => {
  it("skips 10s back and 30s forward", () => {
    expect(watchSkipDeltaSeconds("skip-back")).toBe(-WATCH_SKIP_BACK_SECONDS);
    expect(watchSkipDeltaSeconds("skip-forward")).toBe(WATCH_SKIP_FORWARD_SECONDS);
    expect(WATCH_SKIP_BACK_SECONDS).toBe(10);
    expect(WATCH_SKIP_FORWARD_SECONDS).toBe(30);
  });

  it("flashes a fading badge only for D-pad left/right", () => {
    expect(isWatchRemoteSkipArrowKey("ArrowLeft")).toBe(true);
    expect(isWatchRemoteSkipArrowKey("ArrowRight")).toBe(true);
    expect(isWatchRemoteSkipArrowKey("MediaRewind")).toBe(false);
    expect(isWatchRemoteSkipArrowKey("MediaFastForward")).toBe(false);
    expect(WATCH_SKIP_FEEDBACK_MS).toBe(1000);
  });

  it("accumulates repeated skips in the same direction", () => {
    const first = accumulateWatchSkipFeedback(null, "skip-back");
    expect(first).toEqual({ direction: "back", seconds: 10 });
    expect(accumulateWatchSkipFeedback(first, "skip-back")).toEqual({
      direction: "back",
      seconds: 20,
    });
    expect(accumulateWatchSkipFeedback(first, "skip-forward")).toEqual({
      direction: "forward",
      seconds: 30,
    });
  });
});

describe("watch key classifiers", () => {
  it("treats remote Back variants as back keys", () => {
    expect(isWatchBackKey("Escape")).toBe(true);
    expect(isWatchBackKey("Backspace")).toBe(true);
    expect(isWatchBackKey("GoBack")).toBe(true);
    expect(isWatchBackKey("ArrowLeft")).toBe(false);
  });

  it("treats Enter and Select as confirm", () => {
    expect(isWatchConfirmKey("Enter")).toBe(true);
    expect(isWatchConfirmKey("NumpadEnter")).toBe(true);
    expect(isWatchConfirmKey("Select")).toBe(true);
    expect(isWatchConfirmKey("ArrowDown")).toBe(false);
  });

  it("maps media transport keys", () => {
    expect(watchMediaKeyIntent("MediaPlay")).toBe("play");
    expect(watchMediaKeyIntent("MediaPause")).toBe("pause");
    expect(watchMediaKeyIntent("MediaPlayPause")).toBe("toggle");
    expect(watchMediaKeyIntent("Enter")).toBeNull();
  });
});

describe("resolveWatchBackAction", () => {
  const idle = {
    countdown: false,
    subtitleSearchOpen: false,
    subtitleAppearanceOpen: false,
    panelOpen: false,
    controlsVisible: false,
  };

  it("peels one layer per Back press", () => {
    expect(resolveWatchBackAction({ ...idle, countdown: true })).toBe(
      "exit-after-countdown",
    );
    expect(resolveWatchBackAction({ ...idle, subtitleSearchOpen: true })).toBe(
      "close-search",
    );
    expect(resolveWatchBackAction({ ...idle, subtitleAppearanceOpen: true })).toBe(
      "appearance-to-menu",
    );
    expect(resolveWatchBackAction({ ...idle, panelOpen: true })).toBe("close-panel");
    expect(resolveWatchBackAction({ ...idle, controlsVisible: true })).toBe(
      "hide-chrome",
    );
    expect(resolveWatchBackAction(idle)).toBe("exit-watch");
  });

  it("prefers countdown over open menus", () => {
    expect(
      resolveWatchBackAction({
        countdown: true,
        subtitleSearchOpen: true,
        subtitleAppearanceOpen: true,
        panelOpen: true,
        controlsVisible: true,
      }),
    ).toBe("exit-after-countdown");
  });
});

describe("watchScrubKeyIntent", () => {
  it("commits on OK and nudges on horizontal keys", () => {
    expect(watchScrubKeyIntent("Enter")).toBe("commit");
    expect(watchScrubKeyIntent("Select")).toBe("commit");
    expect(watchScrubKeyIntent("ArrowLeft")).toBe("nudge-back");
    expect(watchScrubKeyIntent("MediaRewind")).toBe("nudge-back");
    expect(watchScrubKeyIntent("ArrowRight")).toBe("nudge-forward");
    expect(watchScrubKeyIntent("MediaFastForward")).toBe("nudge-forward");
    expect(watchScrubKeyIntent("ArrowUp")).toBeNull();
  });

  it("nudges 10 seconds as a percent of a long title", () => {
    expect(watchScrubNudgeStepPercent(7200)).toBeCloseTo((10 / 7200) * 100);
    expect(watchScrubNudgeStepPercent(0)).toBe(2);
    expect(
      nudgeScrubPreviewPercent({
        currentPreview: 50,
        displayedProgress: 50,
        direction: "forward",
        totalDurationSeconds: 7200,
      }),
    ).toBeCloseTo(50 + (10 / 7200) * 100);
    expect(
      nudgeScrubPreviewPercent({
        currentPreview: null,
        displayedProgress: 0.05,
        direction: "back",
        totalDurationSeconds: 7200,
      }),
    ).toBe(0);
  });
});

describe("resolveScrubCommitDecision", () => {
  it("commits a 10s D-pad nudge on a long title", () => {
    const totalDurationSeconds = 7200;
    const livePercent = 50;
    const step = watchScrubNudgeStepPercent(totalDurationSeconds);
    expect(
      resolveScrubCommitDecision({
        previewPercent: livePercent + step,
        livePercent,
        totalDurationSeconds,
      }),
    ).toBe("commit");
  });

  it("discards OK when the preview never left the live playhead", () => {
    expect(
      resolveScrubCommitDecision({
        previewPercent: 40,
        livePercent: 40,
        totalDurationSeconds: 7200,
      }),
    ).toBe("discard");
  });

  it("is a no-op without a preview or duration", () => {
    expect(
      resolveScrubCommitDecision({
        previewPercent: null,
        livePercent: 40,
        totalDurationSeconds: 7200,
      }),
    ).toBe("noop");
    expect(
      resolveScrubCommitDecision({
        previewPercent: 50,
        livePercent: 40,
        totalDurationSeconds: 0,
      }),
    ).toBe("noop");
  });
});

describe("watchChromeVerticalArrowIntent", () => {
  it("moves Down from the scrubber to Play", () => {
    expect(
      watchChromeVerticalArrowIntent({
        key: "ArrowDown",
        controlsVisible: true,
        focusOnScrub: true,
        focusOnTransport: false,
      }),
    ).toBe("focus-play");
  });

  it("moves Up from the transport row to the scrubber", () => {
    expect(
      watchChromeVerticalArrowIntent({
        key: "ArrowUp",
        controlsVisible: true,
        focusOnScrub: false,
        focusOnTransport: true,
      }),
    ).toBe("focus-scrub");
  });

  it("consumes Up on the scrubber instead of leaking to catalog focus", () => {
    expect(
      watchChromeVerticalArrowIntent({
        key: "ArrowUp",
        controlsVisible: true,
        focusOnScrub: true,
        focusOnTransport: false,
      }),
    ).toBe("consume");
  });

  it("reveals and focuses Play on Down when chrome is hidden", () => {
    expect(
      watchChromeVerticalArrowIntent({
        key: "ArrowDown",
        controlsVisible: false,
        focusOnScrub: false,
        focusOnTransport: false,
      }),
    ).toBe("reveal-and-focus-play");
  });

  it("reveals and focuses Play on Up when chrome is hidden", () => {
    expect(
      watchChromeVerticalArrowIntent({
        key: "ArrowUp",
        controlsVisible: false,
        focusOnScrub: false,
        focusOnTransport: false,
      }),
    ).toBe("reveal-and-focus-play");
  });

  it("reveals on Up when chrome is visible but focus is outside the bar", () => {
    expect(
      watchChromeVerticalArrowIntent({
        key: "ArrowUp",
        controlsVisible: true,
        focusOnScrub: false,
        focusOnTransport: false,
      }),
    ).toBe("reveal-and-focus-play");
  });
});

describe("spatialNavShouldHandleWatchArrow", () => {
  it("moves left/right between visible transport buttons", () => {
    expect(
      spatialNavShouldHandleWatchArrow({
        watchPlayerActive: true,
        focusOnScrub: false,
        inWatchMenu: false,
        inWatchControls: true,
        key: "ArrowRight",
      }),
    ).toBe(true);
  });

  it("defers Up/Down and scrub arrows to watch-view", () => {
    expect(
      spatialNavShouldHandleWatchArrow({
        watchPlayerActive: true,
        focusOnScrub: true,
        inWatchMenu: false,
        inWatchControls: true,
        key: "ArrowLeft",
      }),
    ).toBe(false);
    expect(
      spatialNavShouldHandleWatchArrow({
        watchPlayerActive: true,
        focusOnScrub: false,
        inWatchMenu: false,
        inWatchControls: true,
        key: "ArrowUp",
      }),
    ).toBe(false);
  });

  it("lets menus use normal spatial nav", () => {
    expect(
      spatialNavShouldHandleWatchArrow({
        watchPlayerActive: true,
        focusOnScrub: false,
        inWatchMenu: true,
        inWatchControls: false,
        key: "ArrowDown",
      }),
    ).toBe(true);
  });
});

describe("resolveTvSeekPlan", () => {
  it("no-ops when duration is unknown", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 120,
        totalDurationSeconds: 0,
        usesNativePlayer: true,
        usingHls: false,
        hlsStartOffset: 0,
      }),
    ).toEqual({ kind: "noop-no-duration" });
  });

  it("clamps native direct play to the title length", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 9999,
        totalDurationSeconds: 3600,
        usesNativePlayer: true,
        usingHls: false,
        hlsStartOffset: 0,
      }),
    ).toEqual({ kind: "native-direct", absoluteSeconds: 3600 });
    expect(clampAbsoluteSeekSeconds(-10, 3600)).toBe(0);
  });

  it("seeks native HLS in-session after the session offset", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 1500,
        totalDurationSeconds: 7200,
        usesNativePlayer: true,
        usingHls: true,
        hlsStartOffset: 1200,
      }),
    ).toEqual({
      kind: "native-hls-relative",
      absoluteSeconds: 1500,
      relativeSeconds: 300,
    });
  });

  it("restarts native HLS when rewinding before the session offset", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 0,
        totalDurationSeconds: 7200,
        usesNativePlayer: true,
        usingHls: true,
        hlsStartOffset: 1200,
      }),
    ).toEqual({ kind: "native-hls-restart", absoluteSeconds: 0 });
  });

  it("restarts web HLS when the video is not ready yet", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 1220,
        totalDurationSeconds: 7200,
        usesNativePlayer: false,
        usingHls: true,
        hlsStartOffset: 1200,
        seekableEndRelative: 40,
        videoReadyState: 0,
        hasWebVideo: true,
      }),
    ).toEqual({ kind: "web-hls-restart", absoluteSeconds: 1220 });
  });

  it("seeks web HLS in-session once MSE is ready", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 1220,
        totalDurationSeconds: 7200,
        usesNativePlayer: false,
        usingHls: true,
        hlsStartOffset: 1200,
        seekableEndRelative: 40,
        videoReadyState: 2,
        hasWebVideo: true,
      }),
    ).toEqual({
      kind: "web-hls-relative",
      absoluteSeconds: 1220,
      relativeSeconds: 20,
    });
  });

  it("assigns web direct play when the video element is present", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 90,
        totalDurationSeconds: 3600,
        usesNativePlayer: false,
        usingHls: false,
        hlsStartOffset: 0,
        hasWebVideo: true,
      }),
    ).toEqual({ kind: "web-direct", absoluteSeconds: 90 });
  });

  it("does not assign a web currentTime write when the video is missing", () => {
    expect(
      resolveTvSeekPlan({
        targetAbsoluteSeconds: 90,
        totalDurationSeconds: 3600,
        usesNativePlayer: false,
        usingHls: false,
        hlsStartOffset: 0,
        hasWebVideo: false,
      }),
    ).toEqual({ kind: "web-missing-video", absoluteSeconds: 90 });
  });
});

describe("TV watch player — wiring (do not revert)", () => {
  const watchView = readFileSync(
    path.join(webRoot, "components/tv/views/watch-view.tsx"),
    "utf8",
  );
  const spatialNav = readFileSync(
    path.join(webRoot, "components/tv/tv-spatial-nav.tsx"),
    "utf8",
  );

  it("watch view uses extracted back, seek, and scrub policy", () => {
    expect(watchView).toContain("resolveWatchBackAction");
    expect(watchView).toContain("resolveTvSeekPlan");
    expect(watchView).toContain("resolveScrubCommitDecision");
    expect(watchView).toContain("watchScrubKeyIntent");
    expect(watchView).toContain("watchChromeVerticalArrowIntent");
    expect(watchView).toContain("watchSkipDeltaSeconds");
    expect(watchView).toContain("TV_WATCH_REMOTE_KEY_EVENT");
    expect(watchView).toContain("flashRemoteSkipFeedback");
    expect(watchView).toContain("isWatchRemoteSkipArrowKey");
    expect(watchView).toContain("WatchSkipFeedbackBadge");
    expect(watchView).toContain("revealControls: false");
  });

  it("spatial nav uses the extracted watch-arrow guard", () => {
    expect(spatialNav).toContain("spatialNavShouldHandleWatchArrow");
  });
});
