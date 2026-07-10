import crypto from "node:crypto";
import fs from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Strong ETag from file stat — safe for direct-play range responses. */
export function strongEtagForSize(size: number, mtimeMs: number): string {
  return `"${size.toString(36)}-${Math.floor(mtimeMs).toString(36)}"`;
}

/** Strong ETag from m3u8 content — cheap, no fs hashing. */
export function strongEtagForString(content: string): string {
  const hash = crypto.createHash("sha1").update(content, "utf8").digest("hex").slice(0, 16);
  return `"${content.length.toString(36)}-${hash}"`;
}

export function setStrongEtag(reply: FastifyReply, etag: string): void {
  reply.header("ETag", etag);
}

export function matchConditionalGet(
  request: FastifyRequest,
  reply: FastifyReply,
  etag: string,
): boolean {
  const noneMatch = request.headers["if-none-match"];
  if (!noneMatch) return false;
  const candidates = noneMatch
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (candidates.includes("*") || candidates.includes(etag)) {
    reply.status(304).send();
    return true;
  }
  return false;
}

/** Best-effort stat; null on missing file. */
export function statOrNull(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}
