import { describe, expect, it, beforeEach } from "vitest";
import {
  readStoredSubtitleSelection,
  writeStoredSubtitleSelection,
} from "./subtitle-selection-storage";

describe("subtitle selection storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips active subtitle per title", () => {
    writeStoredSubtitleSelection(42, "movie", 7);
    expect(readStoredSubtitleSelection(42, "movie")).toBe(7);
    expect(readStoredSubtitleSelection(42, "episode")).toBeNull();
  });

  it("clears stored selection", () => {
    writeStoredSubtitleSelection(42, "movie", 7);
    writeStoredSubtitleSelection(42, "movie", null);
    expect(readStoredSubtitleSelection(42, "movie")).toBeNull();
  });
});
