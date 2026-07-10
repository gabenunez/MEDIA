import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateHlsPlaylist,
  isTranscodeComplete,
  parseFfmpegPlaylist,
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

/**
 * Write an ffmpeg-style master.m3u8 alongside the segment files, mirroring
 * what real ffmpeg emits (accurate EXTINF, INDEPENDENT-SEGMENTS, EVENT type,
 * optional trailing ENDLIST).
 */
function writeFfmpegPlaylist(
  dir: string,
  count: number,
  options: {
    segmentDuration?: number;
    complete?: boolean;
    exitCode?: number | null;
    leadingDiscontinuity?: boolean;
  } = {},
): void {
  const dur = options.segmentDuration ?? 6;
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    // ffmpeg rounds the target duration up to a whole number of seconds.
    `#EXT-X-TARGETDURATION:${Math.ceil(dur)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:EVENT",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];
  for (let i = 0; i < count; i++) {
    if (i === 0 && options.leadingDiscontinuity) {
      lines.push("#EXT-X-DISCONTINUITY");
    }
    lines.push(`#EXTINF:${dur.toFixed(6)},`);
    lines.push(`segment_${String(i).padStart(3, "0")}.ts`);
  }
  if (options.complete) {
    lines.push("#EXT-X-ENDLIST");
  }
  lines.push("");
  fs.writeFileSync(path.join(dir, "master.m3u8"), lines.join("\n"));

  if (options.exitCode !== undefined) {
    fs.writeFileSync(path.join(dir, ".exit-code"), String(options.exitCode ?? -1));
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

describe("parseFfmpegPlaylist", () => {
  it("parses header, accurate per-segment durations, and endlist", () => {
    const parsed = parseFfmpegPlaylist(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:6",
        "#EXT-X-TARGETDURATION:11",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-PLAYLIST-TYPE:EVENT",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        "#EXT-X-DISCONTINUITY",
        "#EXTINF:10.416667,",
        "segment_000.ts",
        "#EXTINF:7.916667,",
        "segment_001.ts",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.hasEndList).toBe(true);
    expect(parsed!.header).toContain("#EXT-X-TARGETDURATION:11");
    expect(parsed!.header).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
    expect(parsed!.segments).toHaveLength(2);
    expect(parsed!.segments[0].tags).toContain("#EXTINF:10.416667,");
    expect(parsed!.segments[0].tags).toContain("#EXT-X-DISCONTINUITY");
    expect(parsed!.segments[1].tags).toContain("#EXTINF:7.916667,");
  });

  it("returns null for a partial file caught mid-flush", () => {
    expect(parseFfmpegPlaylist("#EXT-X-VERSION:6\n")).toBeNull();
  });
});

describe("generateHlsPlaylist", () => {
  it("preserves ffmpeg's accurate per-segment durations instead of assuming 6.0s", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 3);
    // Real ffmpeg segments are 10.4s here, NOT the requested -hls_time of 6.
    writeFfmpegPlaylist(dir, 3, { segmentDuration: 10.416667 });

    const playlist = generateHlsPlaylist(dir, 6, true, -1);

    expect(playlist).toContain("#EXTINF:10.416667,");
    // Must NOT emit the old hardcoded 6.0 duration.
    expect(playlist).not.toContain("#EXTINF:6.0,");
    // Target duration comes from ffmpeg, not segmentDuration+1.
    expect(playlist).toContain("#EXT-X-TARGETDURATION:11");
    expect(playlist).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
  });

  it("does not hide or prune segments ahead of a fresh client, even when encoding has raced far ahead", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 200);
    writeFfmpegPlaylist(dir, 200);

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
    writeFfmpegPlaylist(dir, 400);

    const playlist = generateHlsPlaylist(dir, 6, true, 330);

    expect(playlist).toContain("#EXT-X-MEDIA-SEQUENCE:30");
    expect(playlist).not.toContain("segment_029.ts");
    expect(playlist).toContain("segment_030.ts");
    expect(playlist).toContain("segment_399.ts");
    expect(fs.existsSync(path.join(dir, "segment_029.ts"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "segment_030.ts"))).toBe(true);
  });

  it("drops a leading discontinuity on the first windowed segment", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 400);
    writeFfmpegPlaylist(dir, 400, { leadingDiscontinuity: true });

    const playlist = generateHlsPlaylist(dir, 6, true, 330);

    // The original leading discontinuity was on segment_000, which is now
    // pruned; the new first segment (030) must not carry a stray one.
    const firstSegIdx = playlist!.indexOf("segment_030.ts");
    const beforeFirstSeg = playlist!.slice(0, firstSegIdx);
    const lastDiscontinuity = beforeFirstSeg.lastIndexOf("#EXT-X-DISCONTINUITY");
    const lastExtinf = beforeFirstSeg.lastIndexOf("#EXTINF");
    // No discontinuity should appear between the header and the first segment's EXTINF.
    expect(lastDiscontinuity).toBeLessThan(lastExtinf);
  });

  it("only marks the playlist complete when ffmpeg wrote ENDLIST AND exited cleanly", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 5);
    // ffmpeg finished: ENDLIST present, exit code 0.
    writeFfmpegPlaylist(dir, 5, { complete: true, exitCode: 0 });

    const playlist = generateHlsPlaylist(dir, 6, false, 4);

    expect(playlist).toContain("#EXT-X-ENDLIST");
    expect(playlist).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
  });

  it("never emits ENDLIST while the session is still in progress", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 5);
    // Even if ffmpeg's file happens to contain ENDLIST, an in-progress render
    // must stay an EVENT playlist so the client keeps reloading.
    writeFfmpegPlaylist(dir, 5, { complete: true, exitCode: 0 });

    const playlist = generateHlsPlaylist(dir, 6, true, 4);

    expect(playlist).not.toContain("#EXT-X-ENDLIST");
    expect(playlist).toContain("#EXT-X-PLAYLIST-TYPE:EVENT");
  });

  it("does NOT emit ENDLIST for a SIGTERM'd partial transcode (ffmpeg wrote ENDLIST but exited 255)", () => {
    const dir = createTempHlsDir();
    // ffmpeg was killed after 4 six-second segments (24s) of a 2-hour movie.
    // It flushed #EXT-X-ENDLIST on the way out and exit code is 255 (killed).
    writeSegments(dir, 4);
    writeFfmpegPlaylist(dir, 4, { complete: true, exitCode: 255, segmentDuration: 6 });

    const playlist = generateHlsPlaylist(dir, 6, false, 3, /* sourceDuration */ 7200);

    // Must NOT look finished — the client would otherwise stop at 24s forever.
    expect(playlist).not.toContain("#EXT-X-ENDLIST");
  });

  it("does NOT emit ENDLIST when the playlist doesn't cover the source, even on a clean exit", () => {
    const dir = createTempHlsDir();
    // Clean exit but only 24s produced of a 7200s movie (e.g. source read error).
    writeSegments(dir, 4);
    writeFfmpegPlaylist(dir, 4, { complete: true, exitCode: 0, segmentDuration: 6 });

    const playlist = generateHlsPlaylist(dir, 6, false, 3, 7200);

    expect(playlist).not.toContain("#EXT-X-ENDLIST");
  });

  it("emits ENDLIST when a clean transcode actually covers the source duration", () => {
    const dir = createTempHlsDir();
    // 5 x 6s = 30s produced for a 28s source → covers it.
    writeSegments(dir, 5);
    writeFfmpegPlaylist(dir, 5, { complete: true, exitCode: 0, segmentDuration: 6 });

    const playlist = generateHlsPlaylist(dir, 6, false, 4, 28);

    expect(playlist).toContain("#EXT-X-ENDLIST");
  });

  it("accounts for the session start offset when checking source coverage", () => {
    const dir = createTempHlsDir();
    // Session started at -ss 7000 of a 7200s movie → only 200s remain.
    fs.writeFileSync(path.join(dir, ".start-offset"), JSON.stringify(7000));
    // ~204s produced (34 x 6s) covers the remaining 200s.
    writeSegments(dir, 34);
    writeFfmpegPlaylist(dir, 34, { complete: true, exitCode: 0, segmentDuration: 6 });

    const playlist = generateHlsPlaylist(dir, 6, false, 33, 7200);

    expect(playlist).toContain("#EXT-X-ENDLIST");
  });
});

describe("isTranscodeComplete", () => {
  it("is false for a SIGTERM'd partial transcode", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 4);
    writeFfmpegPlaylist(dir, 4, { complete: true, exitCode: 255, segmentDuration: 6 });
    expect(isTranscodeComplete(dir, 7200)).toBe(false);
  });

  it("is false when produced duration is short of the source", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 4);
    writeFfmpegPlaylist(dir, 4, { complete: true, exitCode: 0, segmentDuration: 6 });
    expect(isTranscodeComplete(dir, 7200)).toBe(false);
  });

  it("is true for a clean transcode that covers the source", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 5);
    writeFfmpegPlaylist(dir, 5, { complete: true, exitCode: 0, segmentDuration: 6 });
    expect(isTranscodeComplete(dir, 28)).toBe(true);
  });

  it("is true when source duration is unknown but ffmpeg exited cleanly", () => {
    const dir = createTempHlsDir();
    writeSegments(dir, 5);
    writeFfmpegPlaylist(dir, 5, { complete: true, exitCode: 0, segmentDuration: 6 });
    expect(isTranscodeComplete(dir, 0)).toBe(true);
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
