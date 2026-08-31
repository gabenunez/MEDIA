import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStoredSubtitleSelection,
  writeStoredSubtitleSelection,
} from "./subtitle-selection-storage";

const isTvClient = vi.fn(() => false);

vi.mock("@/lib/tv-mode-detect", () => ({
  isTvClient: () => isTvClient(),
}));

describe("subtitle selection storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    isTvClient.mockReturnValue(false);
  });

  it("round-trips active subtitle per title in session storage", () => {
    writeStoredSubtitleSelection(42, "movie", 7);
    expect(readStoredSubtitleSelection(42, "movie")).toBe(7);
    expect(readStoredSubtitleSelection(42, "episode")).toBeNull();
  });

  it("clears stored selection", () => {
    writeStoredSubtitleSelection(42, "movie", 7);
    writeStoredSubtitleSelection(42, "movie", null);
    expect(readStoredSubtitleSelection(42, "movie")).toBeNull();
  });

  it("persists subtitle selection in localStorage on TV", () => {
    isTvClient.mockReturnValue(true);
    writeStoredSubtitleSelection(42, "movie", 7);
    expect(localStorage.getItem("media:active-subtitle:movie:42")).toBe("7");
    expect(sessionStorage.getItem("media:active-subtitle:movie:42")).toBeNull();
    expect(readStoredSubtitleSelection(42, "movie")).toBe(7);
  });

  it("migrates legacy session storage values on TV", () => {
    isTvClient.mockReturnValue(true);
    sessionStorage.setItem("media:active-subtitle:movie:42", "9");
    expect(readStoredSubtitleSelection(42, "movie")).toBe(9);
    expect(localStorage.getItem("media:active-subtitle:movie:42")).toBe("9");
    expect(sessionStorage.getItem("media:active-subtitle:movie:42")).toBeNull();
  });
});
