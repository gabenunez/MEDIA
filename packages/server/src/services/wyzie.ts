import { gunzipSync } from "node:zlib";
import type { ConfigManager } from "../config.js";
import { subtitleHasContent } from "../utils/subtitle-content.js";

const API_BASE = "https://sub.wyzie.io";
const USER_AGENT = "MEDIA/0.1.0";

const SOURCE_LABELS: Record<string, string> = {
  opensubtitles: "OpenSubtitles",
  subdl: "SubDL",
  podnapisi: "Podnapisi",
  subf2m: "Subf2m",
  animetosho: "AnimeTosho",
  gestdown: "Gestdown",
  jimaku: "Jimaku",
  kitsunekko: "Kitsunekko",
  yify: "YIFY",
  ajatttools: "AJATT Tools",
};

export interface WyzieSearchResult {
  id: string;
  fileId: number;
  provider: "wyzie";
  url: string;
  language: string;
  release: string;
  downloadCount: number;
  hearingImpaired: boolean;
  fileName: string;
  sourceLabel: string;
  source?: string;
  uploader?: string;
}

interface WyzieApiItem {
  id?: string | number;
  url?: string;
  language?: string;
  display?: string;
  release?: string;
  fileName?: string;
  format?: string;
  downloadCount?: number;
  isHearingImpaired?: boolean;
  source?: string;
  ai?: boolean;
}

export class WyzieService {
  constructor(private configManager: Pick<ConfigManager, "get">) {}

  isConfigured(): boolean {
    const key = this.configManager.get().subtitles?.wyzie_api_key?.trim();
    return Boolean(key && key !== "YOUR_KEY_HERE");
  }

  private get apiKey(): string {
    return this.configManager.get().subtitles?.wyzie_api_key?.trim() ?? "";
  }

  async search(params: {
    imdbId?: string | null;
    tmdbId?: number | null;
    seasonNumber?: number;
    episodeNumber?: number;
    languages?: string;
  }): Promise<WyzieSearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error("Wyzie API key is not configured");
    }

    const id = wyzieMediaId(params.imdbId, params.tmdbId);
    if (!id) {
      return [];
    }

    const searchParams = new URLSearchParams();
    searchParams.set("id", id);
    searchParams.set("key", this.apiKey);
    searchParams.set("source", "all");
    searchParams.set("format", "srt");
    searchParams.set("encoding", "utf-8");
    const language = normalizeWyzieLanguages(params.languages);
    if (language) searchParams.set("language", language);
    if (params.seasonNumber !== undefined && params.episodeNumber !== undefined) {
      searchParams.set("season", String(params.seasonNumber));
      searchParams.set("episode", String(params.episodeNumber));
    }

    const items = await this.request<WyzieApiItem[] | WyzieApiItem | { error?: string }>(
      `/search?${searchParams.toString()}`,
    );

    return parseWyzieSearchItems(items).map((item) => this.toSearchResult(item));
  }

  async downloadSubtitleFile(url: string): Promise<{ content: string }> {
    if (!this.isConfigured()) {
      throw new Error("Wyzie API key is not configured");
    }
    if (!url.trim()) {
      throw new Error("Wyzie did not return a download link");
    }

    const downloadUrl = prepareWyzieDownloadUrl(url, this.apiKey);
    const res = await fetch(downloadUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/plain, */*" },
    });
    if (!res.ok) {
      throw new Error(`Failed to download subtitle file (${res.status})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Downloaded subtitle file is empty");
    }

    const payload =
      buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer) : buffer;
    const text = payload.toString("utf-8");
    if (!text.trim()) {
      throw new Error("Downloaded subtitle file has no text content");
    }
    if (!subtitleHasContent(text)) {
      throw new Error("Downloaded subtitle file has no dialogue");
    }

    return { content: text };
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      let message = `Wyzie API error (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        if (body.error) message = body.error;
        else if (body.message) message = body.message;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  private toSearchResult(item: WyzieApiItem): WyzieSearchResult {
    const id = String(item.id ?? "");
    const numericId = Number.parseInt(id, 10);
    const source = item.source?.trim() || "";
    const sourceName = SOURCE_LABELS[source.toLowerCase()] ?? source;
    const label = sourceName ? `Wyzie · ${sourceName}` : "Wyzie";

    return {
      id,
      fileId: Number.isFinite(numericId) ? numericId : 0,
      provider: "wyzie",
      url: item.url ?? "",
      language: (item.language || "und").toLowerCase(),
      release: item.release || item.fileName || item.display || "Unknown release",
      downloadCount: item.downloadCount ?? 0,
      hearingImpaired: Boolean(item.isHearingImpaired),
      fileName: item.fileName ?? "",
      sourceLabel: item.ai ? `${label} · AI` : label,
      source: source || undefined,
    };
  }
}

export function wyzieMediaId(
  imdbId?: string | null,
  tmdbId?: number | null,
): string | null {
  const imdb = imdbId?.trim();
  if (imdb) {
    return imdb.toLowerCase().startsWith("tt") ? imdb : `tt${imdb}`;
  }
  if (tmdbId && tmdbId > 0) return String(tmdbId);
  return null;
}

export function parseWyzieSearchItems(
  payload: WyzieApiItem[] | WyzieApiItem | { error?: string; data?: WyzieApiItem[] } | null,
): WyzieApiItem[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(isUsableWyzieItem);
  if ("data" in payload && Array.isArray(payload.data)) {
    return payload.data.filter(isUsableWyzieItem);
  }
  if (isUsableWyzieItem(payload)) return [payload];
  return [];
}

export function resolveWyzieDownloadUrl(url: string): URL | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, "https://sub.wyzie.io");
    if (parsed.protocol === "http:" && isWyzieHostname(parsed.hostname)) {
      parsed.protocol = "https:";
    }
    return parsed;
  } catch {
    return null;
  }
}

export function withWyzieKey(url: string, apiKey: string): string {
  const parsed = resolveWyzieDownloadUrl(url);
  if (!parsed) {
    throw new Error("Invalid Wyzie download URL");
  }
  if (isWyzieHostname(parsed.hostname) && !parsed.searchParams.get("key")) {
    parsed.searchParams.set("key", apiKey);
  }
  return parsed.toString();
}

export function isAllowedWyzieDownloadUrl(url: string): boolean {
  const parsed = resolveWyzieDownloadUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return !isBlockedDownloadHost(parsed.hostname);
}

export function prepareWyzieDownloadUrl(url: string, apiKey: string): string {
  const parsed = resolveWyzieDownloadUrl(url);
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Invalid Wyzie download URL");
  }
  if (isBlockedDownloadHost(parsed.hostname)) {
    throw new Error("Invalid Wyzie download URL");
  }
  if (isWyzieHostname(parsed.hostname)) {
    if (!parsed.searchParams.get("key")) {
      parsed.searchParams.set("key", apiKey);
    }
    if (!parsed.searchParams.get("encoding")) {
      parsed.searchParams.set("encoding", "utf-8");
    }
  }
  return parsed.toString();
}

function isWyzieHostname(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  return (
    host === "wyzie.io" ||
    host.endsWith(".wyzie.io") ||
    host === "wyzie.ru" ||
    host.endsWith(".wyzie.ru")
  );
}

function isBlockedDownloadHost(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function normalizeWyzieLanguages(languages?: string): string {
  if (!languages) return "";
  return languages
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
}

function isUsableWyzieItem(
  item: WyzieApiItem | { error?: string; data?: WyzieApiItem[] } | null | undefined,
): item is WyzieApiItem {
  if (!item || !("url" in item) || !item.url) return false;
  const format = item.format?.toLowerCase();
  if (!format) return true;
  return format.split(",").some((part) => part.trim() === "srt");
}
