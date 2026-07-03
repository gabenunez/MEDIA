function stripSubtitleMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function isVttCueSetting(line: string): boolean {
  return /^(align|line|position|region|size|vertical):/i.test(line);
}

function isTimestampLine(line: string): boolean {
  return /-->/.test(line);
}

function blockHasDialogue(block: string): boolean {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return false;

  const header = lines[0]?.toUpperCase() ?? "";
  if (header.startsWith("WEBVTT")) return false;
  if (header.startsWith("NOTE")) return false;
  if (header.startsWith("STYLE")) return false;
  if (header.startsWith("REGION")) return false;

  if (!lines.some(isTimestampLine)) return false;

  const textLines = lines.filter(
    (line) =>
      !isTimestampLine(line) &&
      !/^\d+$/.test(line) &&
      !/^WEBVTT/i.test(line) &&
      !isVttCueSetting(line),
  );

  return textLines.some((line) => stripSubtitleMarkup(line).length > 0);
}

/** Returns true when subtitle text contains at least one timed cue with dialogue. */
export function subtitleHasContent(raw: string): boolean {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return false;

  const blocks = text.split(/\n\s*\n/);
  return blocks.some(blockHasDialogue);
}
