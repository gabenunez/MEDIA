import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const YT_DLP_CANDIDATES = [
  "yt-dlp",
  path.join(os.homedir(), "bin", "yt-dlp"),
  "/usr/local/bin/yt-dlp",
  "youtube-dl",
  "/usr/local/bin/youtube-dl",
];

/** Background theme music — high bitrate isn't needed for ~40s fade playback. */
const THEME_MP3_BITRATE = "96k";

/** Re-encode large legacy caches on read. */
const THEME_MP3_RECOMPRESS_BYTES = 1_500_000;

export async function compressThemeMp3(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) return;

  const tmpPath = `${filePath}.compressing.mp3`;
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        filePath,
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        THEME_MP3_BITRATE,
        "-ar",
        "44100",
        "-ac",
        "2",
        tmpPath,
      ],
      { timeout: 60_000 },
    );
    fs.renameSync(tmpPath, filePath);
  } catch {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

export async function downloadYoutubeTheme(
  youtubeUrl: string,
  outputPath: string,
): Promise<boolean> {
  if (fs.existsSync(outputPath)) {
    await ensureCompressedThemeMp3(outputPath);
    return true;
  }

  const outputTemplate = outputPath.replace(/\.mp3$/i, ".%(ext)s");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  for (const binary of YT_DLP_CANDIDATES) {
    try {
      await execFileAsync(
        binary,
        [
          "-f",
          "bestaudio/best",
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "5",
          "-o",
          outputTemplate,
          "--no-playlist",
          "--no-warnings",
          youtubeUrl,
        ],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      );

      if (fs.existsSync(outputPath)) {
        await compressThemeMp3(outputPath);
        return true;
      }

      const sibling = fs
        .readdirSync(path.dirname(outputPath))
        .map((name) => path.join(path.dirname(outputPath), name))
        .find(
          (file) =>
            file.startsWith(outputPath.replace(/\.mp3$/i, "")) &&
            /\.mp3$/i.test(file),
        );

      if (sibling && sibling !== outputPath) {
        fs.renameSync(sibling, outputPath);
      }

      if (fs.existsSync(outputPath)) {
        await compressThemeMp3(outputPath);
        return true;
      }
    } catch {
      // try next downloader
    }
  }

  return false;
}

export async function ensureCompressedThemeMp3(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) return;
  if (fs.statSync(filePath).size <= THEME_MP3_RECOMPRESS_BYTES) return;
  await compressThemeMp3(filePath);
}
