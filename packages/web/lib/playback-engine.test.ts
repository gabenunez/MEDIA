import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeWebPlaybackStartup } from "@/lib/playback-engine";

describe("desktop stream startup", () => {
  const timeoutMs = 1_000;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function watchStartup() {
    const video = document.createElement("video");
    const onReady = vi.fn();
    const onTimeout = vi.fn();
    const stop = observeWebPlaybackStartup({ video, timeoutMs, onReady, onTimeout });
    return { video, onReady, onTimeout, stop };
  }

  it("times out if the stream stalls before playback, even after a brief canplay", () => {
    const { video, onReady, onTimeout } = watchStartup();
    video.dispatchEvent(new Event("canplay"));
    video.dispatchEvent(new Event("waiting"));
    vi.advanceTimersByTime(timeoutMs);
    video.dispatchEvent(new Event("playing"));
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("clears startup when playback advances even if the playing event was missed", () => {
    const { video, onReady, onTimeout } = watchStartup();
    Object.defineProperties(video, {
      paused: { value: false },
    });
    video.dispatchEvent(new Event("timeupdate"));
    expect(onReady).not.toHaveBeenCalled();
    video.currentTime = 0.5;
    video.dispatchEvent(new Event("timeupdate"));
    vi.advanceTimersByTime(timeoutMs);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("does not report failure when a playable video is waiting for a user gesture", () => {
    // Happy DOM doesn't expose the media ready state constants.
    vi.stubGlobal("HTMLMediaElement", { HAVE_FUTURE_DATA: 3 });
    const { video, onReady, onTimeout } = watchStartup();
    Object.defineProperties(video, {
      paused: { value: true },
      readyState: { value: HTMLMediaElement.HAVE_FUTURE_DATA },
    });
    vi.advanceTimersByTime(timeoutMs);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("cannot fire after leaving or replacing the stream", () => {
    const { video, onReady, onTimeout, stop } = watchStartup();
    stop();
    video.dispatchEvent(new Event("playing"));
    vi.advanceTimersByTime(timeoutMs);
    expect(onReady).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
