import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStoredPlaybackQuality,
  writeStoredPlaybackQuality,
} from "./quality-selection-storage";

vi.mock("@/lib/tv-mode-detect", () => ({
  isTvClient: vi.fn(() => true),
}));

describe("quality selection storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("round-trips playback quality on TV", () => {
    writeStoredPlaybackQuality("1080p");
    expect(readStoredPlaybackQuality()).toBe("1080p");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("media:playback-quality", "invalid");
    expect(readStoredPlaybackQuality()).toBeNull();
  });
});
