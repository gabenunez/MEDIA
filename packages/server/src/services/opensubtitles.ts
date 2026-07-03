import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigManager } from "../config.js";

const API_BASE = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "Reel/0.1.0";

export interface OpenSubtitleSearchResult {
  id: string;
  fileId: number;
  language: string;
  release: string;
  downloadCount: number;
  hearingImpaired: boolean;
  fileName: string;
  fps?: number;
  uploader?: string;
}

interface OpenSubtitlesSearchResponse {
  data?: Array<{
    id: string;
    attributes?: {
      language?: string;
      release?: string;
      download_count?: number;
      hearing_impaired?: boolean;
      fps?: number;
      uploader?: { name?: string };
      files?: Array<{ file_id?: number; file_name?: string }>;
      feature_details?: {
        title?: string;
        year?: number;
        imdb_id?: number;
        tmdb_id?: number;
        season_number?: number;
        episode_number?: number;
      };
    };
  }>;
}

interface OpenSubtitlesDownloadResponse {
  link?: string;
  file_name?: string;
  remaining?: number;
}

export class OpenSubtitlesService {
  constructor(private configManager: ConfigManager) {}

  isConfigured(): boolean {
    const key = this.configManager.get().subtitles?.opensubtitles_api_key?.trim();
    return Boolean(key && key !== "YOUR_KEY_HERE");
  }

  private get apiKey(): string {
    return this.configManager.get().subtitles?.opensubtitles_api_key?.trim() ?? "";
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Api-Key", this.apiKey);
    headers.set("User-Agent", USER_AGENT);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      let message = `OpenSubtitles API error (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string; errors?: string[] };
        if (body.message) message = body.message;
        else if (body.errors?.length) message = body.errors.join(", ");
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  async search(params: {
    movieHash?: string;
    movieByteSize?: number;
    query?: string;
    tmdbId?: number;
    imdbId?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    languages?: string;
    type?: "movie" | "episode";
  }): Promise<OpenSubtitleSearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error("OpenSubtitles API key is not configured");
    }

    const searchParams = new URLSearchParams();
    if (params.movieHash && params.movieByteSize) {
      searchParams.set("moviehash", params.movieHash);
      searchParams.set("moviebyte_size", String(params.movieByteSize));
    }
    if (params.query) searchParams.set("query", params.query);
    if (params.tmdbId) searchParams.set("tmdb_id", String(params.tmdbId));
    if (params.imdbId) searchParams.set("imdb_id", String(params.imdbId));
    if (params.seasonNumber !== undefined) {
      searchParams.set("season_number", String(params.seasonNumber));
    }
    if (params.episodeNumber !== undefined) {
      searchParams.set("episode_number", String(params.episodeNumber));
    }
    if (params.languages) searchParams.set("languages", params.languages);
    if (params.type) searchParams.set("type", params.type);
    searchParams.set("order_by", "download_count");
    searchParams.set("order_direction", "desc");

    const data = await this.request<OpenSubtitlesSearchResponse>(
      `/subtitles?${searchParams.toString()}`,
    );

    const results: OpenSubtitleSearchResult[] = [];
    for (const item of data.data ?? []) {
      const attrs = item.attributes;
      const file = attrs?.files?.[0];
      if (!file?.file_id) continue;

      results.push({
        id: item.id,
        fileId: file.file_id,
        language: attrs?.language ?? "und",
        release: attrs?.release ?? file.file_name ?? "Unknown release",
        downloadCount: attrs?.download_count ?? 0,
        hearingImpaired: Boolean(attrs?.hearing_impaired),
        fileName: file.file_name ?? "",
        fps: attrs?.fps,
        uploader: attrs?.uploader?.name,
      });
    }

    return results;
  }

  async downloadSubtitleFile(fileId: number): Promise<{
    content: string;
    fileName: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error("OpenSubtitles API key is not configured");
    }

    const data = await this.request<OpenSubtitlesDownloadResponse>("/download", {
      method: "POST",
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!data.link) {
      throw new Error("OpenSubtitles did not return a download link");
    }

    const fileRes = await fetch(data.link);
    if (!fileRes.ok) {
      throw new Error(`Failed to download subtitle file (${fileRes.status})`);
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const text = this.extractSubtitleText(buffer, data.file_name ?? "subtitle.srt");

    return { content: text, fileName: data.file_name ?? "subtitle.srt" };
  }

  private extractSubtitleText(buffer: Buffer, fileName: string): string {
    let payload = buffer;

    if (payload[0] === 0x1f && payload[1] === 0x8b) {
      payload = gunzipSync(payload);
    } else if (payload[0] === 0x50 && payload[1] === 0x4b) {
      payload = this.extractFromZip(payload);
    }

    const lower = fileName.toLowerCase();
    if (lower.endsWith(".vtt")) {
      return payload.toString("utf-8");
    }

    return payload.toString("utf-8");
  }

  private extractFromZip(buffer: Buffer): Buffer {
    const tmpIn = path.join(
      os.tmpdir(),
      `reel-sub-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
    );
    fs.writeFileSync(tmpIn, buffer);
    try {
      const listing = execFileSync("unzip", ["-Z1", tmpIn], { encoding: "utf-8" });
      const srtFile =
        listing
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.toLowerCase().endsWith(".srt")) ??
        listing.split("\n").map((line) => line.trim()).find(Boolean);

      if (!srtFile) {
        throw new Error("Subtitle archive did not contain an SRT file");
      }

      return execFileSync("unzip", ["-p", tmpIn, srtFile]);
    } finally {
      try {
        fs.unlinkSync(tmpIn);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
