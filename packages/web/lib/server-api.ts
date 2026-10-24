import type {
  ContinueWatchingItem,
  HomePlayTarget,
  Library,
  LibraryDeck,
  MediaItem,
} from "@/lib/api";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG, mediaPageCacheTag } from "@media-app/shared";
import { catalogCacheLife, mediaCacheLife } from "@/lib/catalog-cache";

const INTERNAL_API_HEADER = "x-media-internal";
const INTERNAL_API_TOKEN = "next-isr";

export type PaginatedPageData<T> = {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
};

export type HomeData = {
  continueWatching: ContinueWatchingItem[];
  recentlyAdded: MediaItem[];
  favorites: MediaItem[];
  libraries: Library[];
  decks: LibraryDeck[];
  tmdbConfigured: boolean;
  recentPlay: HomePlayTarget | null;
};

class UpstreamStatus extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`upstream ${status}`);
    this.name = "UpstreamStatus";
    this.status = status;
  }
}

function upstreamStatus(error: unknown): number | null {
  if (error instanceof UpstreamStatus) return error.status;
  if (error instanceof Error) {
    const match = /^upstream (\d+)$/.exec(error.message);
    if (match) return Number(match[1]);
  }
  return null;
}

function internalApiBase(): string {
  if (process.env.MEDIA_INTERNAL_API_URL) {
    return process.env.MEDIA_INTERNAL_API_URL.replace(/\/$/, "");
  }
  const port = process.env.MEDIA_INTERNAL_API_PORT ?? "8097";
  return `http://127.0.0.1:${port}`;
}

async function internalApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set(INTERNAL_API_HEADER, INTERNAL_API_TOKEN);
  return fetch(`${internalApiBase()}${path}`, { ...init, headers });
}

async function readJson<T>(path: string): Promise<T> {
  const res = await internalApiFetch(path);
  if (!res.ok) throw new UpstreamStatus(res.status);
  return (await res.json()) as T;
}

/** Failures throw so a down API is not stored for the cache lifetime. */
async function cachedCatalog<T>(path: string): Promise<T> {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  return readJson<T>(path);
}

async function cachedMedia<T>(mediaId: number, path: string): Promise<T> {
  "use cache";
  cacheLife(mediaCacheLife);
  cacheTag(mediaPageCacheTag(mediaId));
  return readJson<T>(path);
}

async function settled<T>(
  work: Promise<T>,
): Promise<{ data: T | null; unauthorized: boolean }> {
  try {
    return { data: await work, unauthorized: false };
  } catch (error) {
    return { data: null, unauthorized: upstreamStatus(error) === 401 };
  }
}

export async function fetchMediaDetail(mediaId: number): Promise<{
  media: Record<string, unknown> | null;
  unauthorized: boolean;
}> {
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    return { media: null, unauthorized: false };
  }

  try {
    const media = await cachedMedia<Record<string, unknown>>(
      mediaId,
      `/api/media/${mediaId}`,
    );
    return { media, unauthorized: false };
  } catch (error) {
    const status = upstreamStatus(error);
    if (status === 401) return { media: null, unauthorized: true };
    if (status === 404) return { media: null, unauthorized: false };
    if (status != null) {
      throw new Error(`Failed to fetch media ${mediaId}: ${status}`);
    }
    throw error;
  }
}

export async function fetchRelatedMedia(
  mediaId: number,
): Promise<Array<Record<string, unknown>>> {
  if (!Number.isFinite(mediaId) || mediaId <= 0) return [];

  const data = await cachedRelated(mediaId);
  return Array.isArray(data.items)
    ? (data.items as Array<Record<string, unknown>>)
    : [];
}

async function cachedRelated(mediaId: number): Promise<{ items?: unknown }> {
  "use cache";
  cacheLife(mediaCacheLife);
  cacheTag(mediaPageCacheTag(mediaId));
  cacheTag(HOME_CATALOG_CACHE_TAG);
  return readJson<{ items?: unknown }>(`/api/media/${mediaId}/related`);
}

export function fetchHome() {
  return settled(cachedCatalog<HomeData>("/api/home"));
}

export function fetchLibraries() {
  return settled(cachedCatalog<unknown[]>("/api/libraries"));
}

export function fetchLibraryItems(libraryId: number, page = 1) {
  return settled(
    cachedCatalog<PaginatedPageData<MediaItem>>(
      `/api/libraries/${libraryId}/items?page=${page}`,
    ),
  );
}

export function fetchDeck(deckId: number) {
  return settled(cachedCatalog<Record<string, unknown>>(`/api/decks/${deckId}`));
}

export function fetchDeckItems(deckId: number, page = 1) {
  return settled(
    cachedCatalog<PaginatedPageData<MediaItem>>(
      `/api/decks/${deckId}/items?page=${page}`,
    ),
  );
}

export function fetchFavorites(page = 1, type?: "movie" | "tv") {
  const query = new URLSearchParams({ page: String(page) });
  if (type) query.set("type", type);
  return settled(
    cachedCatalog<PaginatedPageData<MediaItem>>(`/api/favorites?${query}`),
  );
}

export function fetchContinueWatching(page = 1) {
  return settled(
    cachedCatalog<PaginatedPageData<ContinueWatchingItem>>(
      `/api/continue-watching?page=${page}`,
    ),
  );
}

export function fetchRecentlyAdded(page = 1) {
  return settled(
    cachedCatalog<PaginatedPageData<MediaItem>>(`/api/recent?page=${page}`),
  );
}
