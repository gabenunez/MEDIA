import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { waitForFirstSegment } from "./ffmpeg.js";

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
