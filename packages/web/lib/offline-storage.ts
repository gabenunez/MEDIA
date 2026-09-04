import { offlineRecordId } from "@media-app/shared";

export type OfflineWatchType = "movie" | "episode";

export interface OfflineItem {
  id: string;
  type: OfflineWatchType;
  fileId: number;
  mediaId: number | null;
  title: string;
  subtitle: string | null;
  durationMs: number;
  bytes: number;
  height: number;
  codec: "hevc" | "h264";
  posterPath: string | null;
  downloadedAt: number;
  positionMs: number;
}

const DB_NAME = "media-offline";
const DB_VERSION = 1;
const META_STORE = "items";
const VIDEO_DIR = "offline";
const POSTER_DIR = "offline-posters";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeOfflineLibrary(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open offline database"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function canStoreOfflineVideos(): boolean {
  if (typeof navigator === "undefined") return false;
  return "storage" in navigator && typeof indexedDB !== "undefined";
}

type DirectoryHandle = FileSystemDirectoryHandle & {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
};

async function opfsRoot(): Promise<DirectoryHandle | null> {
  const storage = navigator.storage as Navigator["storage"] & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof storage.getDirectory !== "function") return null;
  try {
    return (await storage.getDirectory()) as DirectoryHandle;
  } catch {
    return null;
  }
}

async function directory(
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  const root = await opfsRoot();
  if (!root) return null;
  try {
    return await root.getDirectoryHandle(name, { create: true });
  } catch {
    return null;
  }
}

type WritableFileHandle = FileSystemFileHandle & {
  createWritable?: (options?: { keepExistingData?: boolean }) => Promise<{
    write: (data: BufferSource | Blob) => Promise<void>;
    seek: (position: number) => Promise<void>;
    truncate: (size: number) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export async function hasOpfsWritable(): Promise<boolean> {
  const dir = await directory(VIDEO_DIR);
  if (!dir) return false;
  try {
    const handle = (await dir.getFileHandle(".writable-probe", {
      create: true,
    })) as WritableFileHandle;
    if (typeof handle.createWritable !== "function") return false;
    const writable = await handle.createWritable();
    await writable.close();
    await dir.removeEntry(".writable-probe");
    return true;
  } catch {
    return false;
  }
}

export async function listOfflineItems(): Promise<OfflineItem[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const rows = await idbRequest(store.getAll() as IDBRequest<OfflineItem[]>);
    return [...rows].sort((a, b) => b.downloadedAt - a.downloadedAt);
  } finally {
    db.close();
  }
}

export async function getOfflineItem(
  type: OfflineWatchType,
  fileId: number,
): Promise<OfflineItem | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readonly");
    const row = await idbRequest(
      tx.objectStore(META_STORE).get(offlineRecordId(type, fileId)) as IDBRequest<
        OfflineItem | undefined
      >,
    );
    return row ?? null;
  } finally {
    db.close();
  }
}

export async function saveOfflineItem(item: OfflineItem): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readwrite");
    await idbRequest(tx.objectStore(META_STORE).put(item));
  } finally {
    db.close();
  }
  emit();
}

export async function updateOfflinePosition(
  type: OfflineWatchType,
  fileId: number,
  positionMs: number,
): Promise<void> {
  const item = await getOfflineItem(type, fileId);
  if (!item) return;
  await saveOfflineItem({ ...item, positionMs });
}

export async function getOfflineVideoFile(
  type: OfflineWatchType,
  fileId: number,
): Promise<File | null> {
  const id = offlineRecordId(type, fileId);
  const dir = await directory(VIDEO_DIR);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(`${id}.mp4`);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function getOfflinePosterFile(
  type: OfflineWatchType,
  fileId: number,
): Promise<File | null> {
  const id = offlineRecordId(type, fileId);
  const dir = await directory(POSTER_DIR);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(`${id}.img`);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function removeOfflineItem(
  type: OfflineWatchType,
  fileId: number,
): Promise<void> {
  const id = offlineRecordId(type, fileId);
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readwrite");
    await idbRequest(tx.objectStore(META_STORE).delete(id));
  } finally {
    db.close();
  }

  const videoDir = await directory(VIDEO_DIR);
  try {
    await videoDir?.removeEntry(`${id}.mp4`);
  } catch {
    // missing
  }
  const posterDir = await directory(POSTER_DIR);
  try {
    await posterDir?.removeEntry(`${id}.img`);
  } catch {
    // missing
  }
  emit();
}

export async function saveOfflinePoster(
  type: OfflineWatchType,
  fileId: number,
  blob: Blob,
): Promise<void> {
  const dir = await directory(POSTER_DIR);
  if (!dir) return;
  const handle = (await dir.getFileHandle(`${offlineRecordId(type, fileId)}.img`, {
    create: true,
  })) as WritableFileHandle;
  if (typeof handle.createWritable !== "function") return;
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function writeOfflineVideoFromResponse(
  type: OfflineWatchType,
  fileId: number,
  response: Response,
  onProgress?: (written: number, total: number) => void,
): Promise<{ bytes: number }> {
  const dir = await directory(VIDEO_DIR);
  if (!dir) {
    throw new Error("This browser cannot store videos offline");
  }
  const id = offlineRecordId(type, fileId);
  const handle = (await dir.getFileHandle(`${id}.mp4`, {
    create: true,
  })) as WritableFileHandle;
  if (typeof handle.createWritable !== "function") {
    throw new Error("This iOS version cannot save videos in the app. Update iOS, then Add to Home Screen.");
  }

  const existing = await handle.getFile();
  let start = existing.size;
  const writable = await handle.createWritable({ keepExistingData: start > 0 });

  const contentRange = response.headers.get("content-range");
  const isPartial = response.status === 206;
  if (isPartial && start > 0) {
    await writable.seek(start);
  } else {
    await writable.truncate(0);
    start = 0;
  }

  const lengthHeader = Number(response.headers.get("content-length") ?? 0);
  let total = lengthHeader + (isPartial ? start : 0);
  if (contentRange) {
    const match = /\/(\d+)\s*$/.exec(contentRange);
    if (match) total = Number(match[1]);
  }

  const body = response.body;
  if (!body) {
    await writable.close();
    throw new Error("Empty download");
  }

  const reader = body.getReader();
  let written = start;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      written += value.byteLength;
      onProgress?.(written, total || written);
    }
  } finally {
    await writable.close();
  }

  return { bytes: written };
}

export async function existingOfflineBytes(
  type: OfflineWatchType,
  fileId: number,
): Promise<number> {
  const file = await getOfflineVideoFile(type, fileId);
  return file?.size ?? 0;
}

export async function estimateOfflineQuota(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  } catch {
    return null;
  }
}
