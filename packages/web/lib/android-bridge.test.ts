import { afterEach, describe, expect, it, vi } from "vitest";

describe("toAbsoluteMediaUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    // @ts-expect-error happy-dom window cleanup
    delete globalThis.window;
  });

  it("absolutizes already-prefixed api paths without doubling the base path", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/reel");
    vi.resetModules();

    globalThis.window = {
      location: { origin: "https://media.example" },
    } as Window & typeof globalThis;

    const { toAbsoluteMediaUrl } = await import("./android-bridge");
    expect(toAbsoluteMediaUrl("/reel/api/stream/42?type=movie")).toBe(
      "https://media.example/reel/api/stream/42?type=movie",
    );
    expect(toAbsoluteMediaUrl("/api/stream/42?type=movie")).toBe(
      "https://media.example/reel/api/stream/42?type=movie",
    );
  });
});

describe("applyNativeSubtitleTrack", () => {
  afterEach(() => {
    vi.resetModules();
    // @ts-expect-error happy-dom window cleanup
    delete globalThis.window;
  });

  it("prefers VTT overlay and never requires a playback rebuild", async () => {
    const setSubtitleVtt = vi.fn(() => true);
    const setSubtitles = vi.fn(() => true);
    globalThis.window = {
      location: { origin: "https://media.example" },
      MediaAndroid: {
        logout: () => {},
        play: () => {},
        pause: () => {},
        resume: () => {},
        seekTo: () => {},
        stop: () => {},
        setSubtitleVtt,
        setSubtitles,
      },
    } as unknown as Window & typeof globalThis;

    const { applyNativeSubtitleTrack } = await import("./android-bridge");
    expect(
      applyNativeSubtitleTrack({
        vtt: "WEBVTT\n",
        subtitleUrl: "https://media.example/api/subtitles/1",
      }),
    ).toBe(true);
    expect(setSubtitleVtt).toHaveBeenCalledWith("WEBVTT\n");
    expect(setSubtitles).not.toHaveBeenCalled();
  });
});
