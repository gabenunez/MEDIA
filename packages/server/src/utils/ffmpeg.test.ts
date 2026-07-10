import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateHlsPlaylist,
  pruneOldHlsSegments,
  waitForFirstSegment,
} from "./ffmpeg.js";

const tempDirs: string[] = [];

function createTempHlsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-hls-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeSegments(dir: string, count: number): void {
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(
      path.join(dir, `segment_${String(i).padStart(3, "0")}.ts`),
      "segment",
    );
  }
}

describe("pruneOldHlsSegments", () => {
  it("keeps everything the client hasn't consumed yet, even far past the window size", () => {
    // FFmpeg has no realtime throttle and can encode well ahead of playback.
    // A client that just opened the stream (minSegmentIndex <= 0) must never
    // have segments pruned out from under it.
    const dir = createTempHlsDir();
    writeSegments(dir, 200);

    pruneOldHlsSegments(dir, 0);

    expect(fs.existsSync(path.join(dir, "segment_000.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "segment_199.ts"))).toBe(true);
  });

  it("only deletes segments strictly older than the consumption floor", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 200);

    pruneOldHlsSegments(dir, 30);

    expect(fs.existsSync(path.join(dir, "segment_029.ts"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "segment_030.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "segment_199.ts"))).toBe(true);
  });
});

describe("generateHlsPlaylist", () => {
  it("does not hide or prune segments ahead of a fresh client, even when encoding has raced far ahead", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 200);

    // A fresh session: nothing served yet (lastServedSegmentIndex = -1).
    const playlist = generateHlsPlaylist(dir, 6, true, -1);

    expect(playlist).toContain("#EXT-X-MEDIA-SEQUENCE:0");
    expect(playlist).toContain("#EXT-X-PLAYLIST-TYPE:EVENT");
    expect(playlist).toContain("segment_000.ts");
    expect(fs.existsSync(path.join(dir, "segment_000.ts"))).toBe(true);
  });

  it("windows the playlist and prunes disk relative to what the client has actually requested", () => {
    const dir = createTempHlsDir();
    // Window is HLS_PLAYLIST_WINDOW_SEGMENTS (300). With 400 segments on disk
    // and client having consumed through 330, window trails consumption (30..).
    writeSegments(dir, 400);

    const playlist = generateHlsPlaylist(dir, 6, true, 330);

    expect(playlist).toContain("#EXT-X-MEDIA-SEQUENCE:30");
    expect(playlist).not.toContain("segment_029.ts");
    expect(playlist).toContain("segment_030.ts");
    expect(playlist).toContain("segment_399.ts");
    expect(fs.existsSync(path.join(dir, "segment_029.ts"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "segment_030.ts"))).toBe(true);
  });
});

describe("waitForFirstSegment", () => {
  it("accepts a completed one-segment HLS playlist", async () => {
    const dir = createTempHlsDir();
    fs.writeFileSync(path.join(dir, "segment_000.ts"), "segment");
    fs.writeFileSync(
      path.join(dir, "master.m3u8"),
      [
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:6",
        "#EXTINF:3.0,",
        "segment_000.ts",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );

    await expect(waitForFirstSegment(dir, 1, 2)).resolves.toBe(true);
  });
});
