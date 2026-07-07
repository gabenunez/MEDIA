import { parseVttTimestamp } from "./vtt-timing.js";

export interface WebVttCue {
  start: number;
  end: number;
  text: string;
}

function stripVttMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function isCueSettingLine(line: string): boolean {
  return /^(align|line|position|region|size|vertical):/i.test(line);
}

/** Parse dialogue cues from a WebVTT document. */
export function parseWebVttCues(vtt: string): WebVttCue[] {
  const normalized = vtt.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const cues: WebVttCue[] = [];
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const header = lines[0]?.toUpperCase() ?? "";
    if (header.startsWith("WEBVTT") && !block.includes("-->")) continue;
    if (header.startsWith("NOTE") || header.startsWith("STYLE") || header.startsWith("REGION")) {
      continue;
    }

    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex === -1) continue;

    const match = lines[timeLineIndex].match(/^(.+?)\s+-->\s+(.+?)(\s+.*)?$/);
    if (!match) continue;

    const start = parseVttTimestamp(match[1]);
    const end = parseVttTimestamp(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const text = lines
      .slice(timeLineIndex + 1)
      .filter((line) => !isCueSettingLine(line) && !/^\d+$/.test(line))
      .map(stripVttMarkup)
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!text) continue;
    cues.push({ start, end, text });
  }

  return cues;
}

export function findActiveCueTexts(cues: WebVttCue[], timeSeconds: number): string[] {
  if (!Number.isFinite(timeSeconds) || cues.length === 0) return [];

  const active: string[] = [];
  for (const cue of cues) {
    if (timeSeconds >= cue.start && timeSeconds < cue.end) {
      active.push(cue.text);
    }
  }
  return active;
}
