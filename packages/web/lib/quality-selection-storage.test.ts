import { beforeEach, describe, expect, it } from "vitest";
import {
  persistPlaybackQuality,
  readStoredItemPlaybackQuality,
  readStoredPlaybackQuality,
  writeStoredItemPlaybackQuality,
  writeStoredPlaybackQuality,
} from "./quality-selection-storage";

describe("quality selection storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips playback quality", () => {
    writeStoredPlaybackQuality("1080p");
    expect(readStoredPlaybackQuality()).toBe("1080p");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("media:playback-quality", "invalid");
    expect(readStoredPlaybackQuality()).toBeNull();
  });

  it("stores quality per title without overwriting another title", () => {
    writeStoredItemPlaybackQuality("movie", 1, "1080p");
    writeStoredItemPlaybackQuality("movie", 2, "original");
    expect(readStoredItemPlaybackQuality("movie", 1)).toBe("1080p");
    expect(readStoredItemPlaybackQuality("movie", 2)).toBe("original");
  });

  it("persistPlaybackQuality writes both the title and the global fallback", () => {
    persistPlaybackQuality("720p", { itemType: "episode", itemId: 9 });
    expect(readStoredItemPlaybackQuality("episode", 9)).toBe("720p");
    expect(readStoredPlaybackQuality()).toBe("720p");
  });
});
