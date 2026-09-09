import { describe, expect, it } from "vitest";
import {
  IDLE_POLL_MS,
  SCAN_POLL_MS,
  TV_IDLE_POLL_MS,
  scanPollDelayMs,
} from "./scan-poll";

describe("scanPollDelayMs", () => {
  it("polls quickly while a scan is running", () => {
    expect(scanPollDelayMs({ scanning: true, tv: false })).toBe(SCAN_POLL_MS);
    expect(scanPollDelayMs({ scanning: true, tv: true })).toBe(SCAN_POLL_MS);
  });

  it("slows idle polling on TV", () => {
    expect(scanPollDelayMs({ scanning: false, tv: false })).toBe(IDLE_POLL_MS);
    expect(scanPollDelayMs({ scanning: false, tv: true })).toBe(TV_IDLE_POLL_MS);
  });

  it("pauses while the document is hidden", () => {
    expect(
      scanPollDelayMs({ scanning: false, tv: true, hidden: true }),
    ).toBeNull();
    expect(
      scanPollDelayMs({ scanning: true, tv: false, hidden: true }),
    ).toBeNull();
  });
});
