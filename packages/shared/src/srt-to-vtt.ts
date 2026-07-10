/** Convert SubRip (SRT) dialogue to WebVTT for browser + ExoPlayer. */
export function convertSrtToVtt(srtContent: string): string {
  const normalized = srtContent
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!normalized) return "WEBVTT\n";

  const lines = normalized.split("\n");
  const blocks: string[] = ["WEBVTT", ""];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? "";
    if (!line) {
      i += 1;
      continue;
    }

    // Optional numeric cue index
    if (/^\d+$/.test(line)) {
      i += 1;
    }

    const timeLine = lines[i]?.trim() ?? "";
    if (!timeLine.includes("-->")) {
      i += 1;
      continue;
    }

    // SRT uses comma decimals; WebVTT requires a period.
    const vttTime = timeLine.replace(/,/g, ".");
    i += 1;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i += 1;
    }

    if (textLines.some((text) => text.trim())) {
      blocks.push(vttTime, ...textLines, "");
    }
  }

  return `${blocks.join("\n").trimEnd()}\n`;
}
