const VTT_TIMESTAMP = /(\d{1,2}:)?\d{1,2}:\d{2}\.\d{3}/;

export function parseVttTimestamp(value: string): number {
  const trimmed = value.trim();
  const segments = trimmed.split(":");
  if (segments.length === 2) {
    const [minutes, secondsMs] = segments;
    const [seconds, millis = "0"] = secondsMs.split(".");
    return (
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      parseInt(millis.padEnd(3, "0").slice(0, 3), 10) / 1000
    );
  }

  if (segments.length === 3) {
    const [hours, minutes, secondsMs] = segments;
    const [seconds, millis = "0"] = secondsMs.split(".");
    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      parseInt(millis.padEnd(3, "0").slice(0, 3), 10) / 1000
    );
  }

  return 0;
}

export function formatVttTimestamp(seconds: number): string {
  // Round via total milliseconds so 0.9996s never formats as ".1000".
  let totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  totalMs -= hours * 3_600_000;
  const minutes = Math.floor(totalMs / 60_000);
  totalMs -= minutes * 60_000;
  const secs = Math.floor(totalMs / 1000);
  const millis = totalMs - secs * 1000;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** Normalize subtitle timeline offsets for URL/query transport (ms precision). */
export function normalizeSubtitleOffsetSeconds(offsetSeconds: number): number {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds <= 0) return 0;
  return Math.round(offsetSeconds * 1000) / 1000;
}

function shiftTimestampToken(token: string, offsetSeconds: number): string {
  const shifted = parseVttTimestamp(token) - offsetSeconds;
  return formatVttTimestamp(shifted);
}

function shiftCueTimestampLine(line: string, offsetSeconds: number): string | null {
  const match = line.match(/^(.+?)\s+-->\s+(.+?)(\s+.*)?$/);
  if (!match) return line;

  const endSeconds = parseVttTimestamp(match[2]) - offsetSeconds;
  if (endSeconds <= 0) return null;

  const startSeconds = Math.max(0, parseVttTimestamp(match[1]) - offsetSeconds);
  const settings = match[3] ?? "";
  return `${formatVttTimestamp(startSeconds)} --> ${formatVttTimestamp(endSeconds)}${settings}`;
}

/** Shift all cue timestamps so they align with a relative HLS timeline.
 * NOTE(formatting): shifts timestamps **only**; re-uses formatVttTimestamp for
 * both start/end so hh:mm:ss.mmm precision is preserved. offset=0 fast-path
 * returns the exact input string unmodified so callers don't trigger cache
 * churn or unnecessary re-renders on the subtitle path.
 */
export function shiftVttByOffset(vtt: string, offsetSeconds: number): string {
  if (offsetSeconds <= 0 || !Number.isFinite(offsetSeconds)) return vtt;

  const normalized = vtt.replace(/\r\n/g, "\n").trimEnd();
  const blocks = normalized.split(/\n\s*\n/);
  const shiftedBlocks: string[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    const upper = block.trimStart().toUpperCase();
    if (upper.startsWith("WEBVTT") && !block.includes("-->")) {
      shiftedBlocks.push(block);
      continue;
    }

    const lines = block.split("\n");
    const nextLines: string[] = [];
    let dropCue = false;

    for (const line of lines) {
      if (line.includes("-->")) {
        const shiftedLine = shiftCueTimestampLine(line, offsetSeconds);
        if (shiftedLine === null) {
          dropCue = true;
          break;
        }
        nextLines.push(shiftedLine);
      } else {
        nextLines.push(line);
      }
    }

    if (!dropCue && nextLines.some((line) => line.includes("-->"))) {
      shiftedBlocks.push(nextLines.join("\n"));
    }
  }

  return shiftedBlocks.join("\n\n");
}

export function vttCueLineHasTimestamp(line: string): boolean {
  return VTT_TIMESTAMP.test(line) && line.includes("-->");
}
