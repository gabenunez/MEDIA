import { describe, expect, it } from "vitest";
import { formatDownloadSize, sumOfflineBytes } from "./offline-library";

describe("sumOfflineBytes", () => {
  it("adds saved sizes and ignores missing values", () => {
    expect(
      sumOfflineBytes([
        { bytes: 120 * 1024 * 1024 },
        { bytes: 80 * 1024 * 1024 },
        { bytes: null },
        {},
      ]),
    ).toBe(200 * 1024 * 1024);
  });

  it("is zero for an empty library", () => {
    expect(sumOfflineBytes([])).toBe(0);
  });
});

describe("formatDownloadSize", () => {
  it("shows megabytes for typical phone downloads", () => {
    expect(formatDownloadSize(240 * 1024 * 1024)).toBe("240.0 MB");
  });

  it("shows 0 B for an empty total", () => {
    expect(formatDownloadSize(0)).toBe("0 B");
  });
});
