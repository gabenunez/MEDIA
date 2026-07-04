import fs from "node:fs";
import path from "node:path";
import { eq, and, or } from "drizzle-orm";
import { isSubtitleFile } from "@media-app/shared";
import type { AppConfig } from "@media-app/shared";
import type { DatabaseInstance } from "../db/index.js";
import { subtitles, movieFiles, tvEpisodes } from "../db/schema.js";
import {
  extractEmbeddedSubtitle,
  type ProbeResult,
} from "../utils/ffmpeg.js";
import { subtitleHasContent } from "../utils/subtitle-content.js";

const LANGUAGE_MAP: Record<string, string> = {
  en: "English",
  eng: "English",
  es: "Spanish",
  spa: "Spanish",
  fr: "French",
  fre: "French",
  fra: "French",
  de: "German",
  ger: "German",
  deu: "German",
  it: "Italian",
  ita: "Italian",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  pt: "Portuguese",
  por: "Portuguese",
  ru: "Russian",
  rus: "Russian",
  zh: "Chinese",
  zho: "Chinese",
  chi: "Chinese",
};

function parseSubtitleLanguage(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const parts = base.split(".");
  if (parts.length >= 2) {
    const langPart = parts[parts.length - 1].toLowerCase();
    return LANGUAGE_MAP[langPart] ?? langPart;
  }
  return "Unknown";
}

function displayLanguage(code: string): string {
  return LANGUAGE_MAP[code.toLowerCase()] ?? code;
}

export function subtitleToTrack(subtitle: typeof subtitles.$inferSelect) {
  return {
    id: subtitle.id,
    language: subtitle.language,
    label: subtitle.label,
    source: subtitle.source,
  };
}

export class SubtitleService {
  private cacheDir: string;

  constructor(
    private db: DatabaseInstance,
    config: AppConfig,
  ) {
    this.cacheDir = path.join(config.data_dir, "cache", "subtitles");
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  async discoverForMovieFile(
    movieFileId: number,
    filePath: string,
    probe: ProbeResult | null,
  ): Promise<void> {
    await this.db
      .delete(subtitles)
      .where(
        and(
          eq(subtitles.movieFileId, movieFileId),
          or(
            eq(subtitles.source, "external"),
            eq(subtitles.source, "embedded"),
          ),
        ),
      );

    await this.discoverExternal(filePath, { movieFileId });
    if (probe) {
      await this.discoverEmbedded(movieFileId, "movie", filePath, probe);
    }
  }

  async discoverForEpisode(
    episodeId: number,
    filePath: string,
    probe: ProbeResult | null,
  ): Promise<void> {
    await this.db
      .delete(subtitles)
      .where(
        and(
          eq(subtitles.episodeId, episodeId),
          or(
            eq(subtitles.source, "external"),
            eq(subtitles.source, "embedded"),
          ),
        ),
      );

    await this.discoverExternal(filePath, { episodeId });
    if (probe) {
      await this.discoverEmbedded(episodeId, "episode", filePath, probe);
    }
  }

  async listForMovieFile(movieFileId: number) {
    const rows = await this.db.query.subtitles.findMany({
      where: eq(subtitles.movieFileId, movieFileId),
    });
    return this.filterTracksWithContent(rows);
  }

  async listForEpisode(episodeId: number) {
    const rows = await this.db.query.subtitles.findMany({
      where: eq(subtitles.episodeId, episodeId),
    });
    return this.filterTracksWithContent(rows);
  }

  private async filterTracksWithContent(
    rows: Array<typeof subtitles.$inferSelect>,
  ) {
    const tracks = [];

    for (const row of rows) {
      if (await this.rowHasContent(row)) {
        tracks.push(subtitleToTrack(row));
      } else if (row.source !== "opensubtitles") {
        await this.deleteSubtitle(row.id);
      }
    }

    return tracks;
  }

  private async rowHasContent(
    subtitle: typeof subtitles.$inferSelect,
  ): Promise<boolean> {
    try {
      const content = await this.getSubtitleContent(subtitle);
      return subtitleHasContent(content);
    } catch {
      return false;
    }
  }

  async attachOpenSubtitlesDownload(params: {
    movieFileId?: number;
    episodeId?: number;
    opensubtitlesFileId: number;
    language: string;
    release: string;
    rawContent: string;
  }) {
    const cachePath = path.join(
      this.cacheDir,
      `os_${params.movieFileId ?? params.episodeId}_${params.opensubtitlesFileId}.vtt`,
    );

    const existing = await this.db.query.subtitles.findFirst({
      where: and(
        params.movieFileId
          ? eq(subtitles.movieFileId, params.movieFileId)
          : eq(subtitles.episodeId, params.episodeId!),
        eq(subtitles.source, "opensubtitles"),
        eq(subtitles.pathOrIndex, cachePath),
      ),
    });

    if (existing && fs.existsSync(existing.pathOrIndex)) {
      return subtitleToTrack(existing);
    }

    const vtt = params.rawContent.trimStart().startsWith("WEBVTT")
      ? params.rawContent
      : this.convertSrtToVtt(params.rawContent);

    if (!subtitleHasContent(vtt)) {
      throw new Error("Subtitle file has no dialogue");
    }

    fs.writeFileSync(cachePath, vtt, "utf-8");

    let persistedContent: string;
    try {
      persistedContent = fs.readFileSync(cachePath, "utf-8");
    } catch {
      this.removeCacheFile(cachePath);
      throw new Error("Failed to persist subtitle file");
    }

    if (!subtitleHasContent(persistedContent)) {
      this.removeCacheFile(cachePath);
      throw new Error("Subtitle file has no dialogue");
    }

    if (existing) {
      return subtitleToTrack(existing);
    }

    try {
      const [row] = await this.db
        .insert(subtitles)
        .values({
          movieFileId: params.movieFileId ?? null,
          episodeId: params.episodeId ?? null,
          language: displayLanguage(params.language),
          label: params.release,
          source: "opensubtitles",
          pathOrIndex: cachePath,
        })
        .returning();

      return subtitleToTrack(row);
    } catch (err) {
      this.removeCacheFile(cachePath);
      throw err;
    }
  }

  private removeCacheFile(cachePath: string): void {
    if (!fs.existsSync(cachePath)) return;
    try {
      fs.unlinkSync(cachePath);
    } catch {
      // ignore cleanup errors
    }
  }

  async deleteSubtitle(id: number): Promise<void> {
    const subtitle = await this.db.query.subtitles.findFirst({
      where: eq(subtitles.id, id),
    });
    if (!subtitle) return;

    if (
      subtitle.source === "opensubtitles" &&
      fs.existsSync(subtitle.pathOrIndex)
    ) {
      try {
        fs.unlinkSync(subtitle.pathOrIndex);
      } catch {
        // ignore cleanup errors
      }
    }

    await this.db.delete(subtitles).where(eq(subtitles.id, id));
  }

  private async discoverExternal(
    videoPath: string,
    ids: { movieFileId?: number; episodeId?: number },
  ): Promise<void> {
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath));

    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!isSubtitleFile(entry)) continue;

      const entryBase = path.basename(entry, path.extname(entry));
      if (
        entryBase === base ||
        entryBase.startsWith(`${base}.`) ||
        entryBase.startsWith(`${base}_`)
      ) {
        const fullPath = path.join(dir, entry);
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const content = entry.toLowerCase().endsWith(".srt")
            ? this.convertSrtToVtt(raw)
            : raw;
          if (!subtitleHasContent(content)) continue;
        } catch {
          continue;
        }

        await this.db.insert(subtitles).values({
          movieFileId: ids.movieFileId ?? null,
          episodeId: ids.episodeId ?? null,
          language: parseSubtitleLanguage(entry),
          label: entry,
          source: "external",
          pathOrIndex: fullPath,
        });
      }
    }
  }

  private async discoverEmbedded(
    fileId: number,
    type: "movie" | "episode",
    filePath: string,
    probe: ProbeResult,
  ): Promise<void> {
    for (const stream of probe.subtitleStreams) {
      const cachePath = path.join(
        this.cacheDir,
        `${type}_${fileId}_sub_${stream.index}.vtt`,
      );

      try {
        if (!fs.existsSync(cachePath)) {
          await extractEmbeddedSubtitle(filePath, stream.index, cachePath);
        }

        const content = fs.readFileSync(cachePath, "utf-8");
        if (!subtitleHasContent(content)) {
          if (fs.existsSync(cachePath)) {
            try {
              fs.unlinkSync(cachePath);
            } catch {
              // ignore cleanup errors
            }
          }
          continue;
        }

        await this.db.insert(subtitles).values({
          movieFileId: type === "movie" ? fileId : null,
          episodeId: type === "episode" ? fileId : null,
          language: stream.language
            ? (LANGUAGE_MAP[stream.language.toLowerCase()] ?? stream.language)
            : "Embedded",
          label: stream.title ?? `Embedded ${stream.index}`,
          source: "embedded",
          pathOrIndex: cachePath,
        });
      } catch {
        // Skip failed registrations
      }
    }
  }

  private parseEmbeddedStreamIndex(cachePath: string): number | null {
    const match = cachePath.match(/_sub_(\d+)\.vtt$/);
    return match ? parseInt(match[1], 10) : null;
  }

  private async ensureEmbeddedExtracted(
    subtitle: typeof subtitles.$inferSelect,
  ): Promise<void> {
    const cachePath = subtitle.pathOrIndex;
    if (fs.existsSync(cachePath)) return;

    const streamIndex = this.parseEmbeddedStreamIndex(cachePath);
    if (streamIndex === null) {
      throw new Error("Invalid embedded subtitle cache path");
    }

    let videoPath: string | undefined;
    if (subtitle.movieFileId) {
      const file = await this.db.query.movieFiles.findFirst({
        where: eq(movieFiles.id, subtitle.movieFileId),
      });
      videoPath = file?.filePath;
    } else if (subtitle.episodeId) {
      const episode = await this.db.query.tvEpisodes.findFirst({
        where: eq(tvEpisodes.id, subtitle.episodeId),
      });
      videoPath = episode?.filePath;
    }

    if (!videoPath) {
      throw new Error("Video file not found for embedded subtitle");
    }

    await extractEmbeddedSubtitle(videoPath, streamIndex, cachePath);
  }

  convertSrtToVtt(srtContent: string): string {
    const lines = srtContent.replace(/\r\n/g, "\n").split("\n");
    let vtt = "WEBVTT\n\n";
    let i = 0;

    while (i < lines.length) {
      if (/^\d+$/.test(lines[i]?.trim() ?? "")) i++;

      const timeLine = lines[i];
      if (timeLine && timeLine.includes("-->")) {
        vtt += timeLine.replace(/,/g, ".") + "\n";
        i++;
        while (i < lines.length && lines[i].trim() !== "") {
          vtt += lines[i] + "\n";
          i++;
        }
        vtt += "\n";
      }
      i++;
    }

    return vtt;
  }

  async getSubtitleContent(subtitle: typeof subtitles.$inferSelect): Promise<string> {
    const filePath = subtitle.pathOrIndex;

    if (subtitle.source === "embedded") {
      await this.ensureEmbeddedExtracted(subtitle);
      return fs.readFileSync(filePath, "utf-8");
    }

    if (filePath.endsWith(".vtt")) {
      return fs.readFileSync(filePath, "utf-8");
    }

    const content = fs.readFileSync(filePath, "utf-8");
    if (filePath.endsWith(".srt")) {
      return this.convertSrtToVtt(content);
    }

    return content;
  }
}
