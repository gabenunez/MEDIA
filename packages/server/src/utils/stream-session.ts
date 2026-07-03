import crypto from "node:crypto";
import type { TranscodeQuality } from "@reel/shared";

export function createStreamSessionId(
  type: "movie" | "episode",
  fileId: number,
  quality: TranscodeQuality,
): string {
  return crypto
    .createHash("md5")
    .update(`${type}:${fileId}:${quality}`)
    .digest("hex");
}
