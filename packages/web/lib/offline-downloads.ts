import { offlineRecordId } from "@media-app/shared";
import { api, type OfflineJob } from "@/lib/api";
import {
  canStoreOfflineVideos,
  existingOfflineBytes,
  getOfflineItem,
  hasOpfsWritable,
  listOfflineItems,
  removeOfflineItem,
  saveOfflineItem,
  saveOfflinePoster,
  subscribeOfflineLibrary,
  writeOfflineVideoFromResponse,
  type OfflineItem,
  type OfflineWatchType,
} from "@/lib/offline-storage";
import { requestPersistentStorage } from "@/lib/pwa";

export type OfflineTransferPhase =
  | "idle"
  | "preparing"
  | "encoding"
  | "downloading"
  | "ready"
  | "error";

export interface OfflineTransfer {
  id: string;
  type: OfflineWatchType;
  fileId: number;
  phase: OfflineTransferPhase;
  progress: number;
  message: string | null;
  estimatedBytes: number | null;
  bytes: number | null;
}

type TransferMap = Map<string, OfflineTransfer>;
const transfers: TransferMap = new Map();
const transferListeners = new Set<() => void>();

function emitTransfers(): void {
  for (const listener of transferListeners) listener();
}

export function subscribeOfflineTransfers(listener: () => void): () => void {
  transferListeners.add(listener);
  return () => {
    transferListeners.delete(listener);
  };
}

export function getOfflineTransfer(
  type: OfflineWatchType,
  fileId: number,
): OfflineTransfer | null {
  return transfers.get(offlineRecordId(type, fileId)) ?? null;
}

export function listOfflineTransfers(): OfflineTransfer[] {
  return [...transfers.values()];
}

export { subscribeOfflineLibrary, listOfflineItems, getOfflineItem };

function setTransfer(next: OfflineTransfer): void {
  transfers.set(next.id, next);
  emitTransfers();
}

function clearTransfer(id: string): void {
  transfers.delete(id);
  emitTransfers();
}

async function cachePoster(job: OfflineJob): Promise<void> {
  if (!job.posterPath) return;
  const url = api.imageUrl(job.posterPath);
  if (!url) return;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    await saveOfflinePoster(job.type, job.fileId, blob);
  } catch {
    // posters are optional
  }
}

async function waitForReadyJob(id: string): Promise<OfflineJob> {
  let delay = 1500;
  for (let attempt = 0; attempt < 2400; attempt += 1) {
    const job = await api.getOfflineJob(id);
    if (job.status === "ready") return job;
    if (job.status === "error") {
      throw new Error(job.error || "Compression failed");
    }
    setTransfer({
      id: job.id,
      type: job.type,
      fileId: job.fileId,
      phase: job.status === "queued" ? "preparing" : "encoding",
      progress: job.status === "encoding" ? job.progress : 0,
      message:
        job.status === "queued"
          ? "Waiting to compress…"
          : `Compressing for iPhone… ${Math.round(job.progress * 100)}%`,
      estimatedBytes: job.estimatedBytes,
      bytes: job.bytes,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(4000, delay + 250);
  }
  throw new Error("Compression timed out");
}

async function downloadReadyFile(job: OfflineJob): Promise<number> {
  const existing = await existingOfflineBytes(job.type, job.fileId);
  const headers = new Headers();
  if (existing > 0) {
    headers.set("Range", `bytes=${existing}-`);
  }
  const res = await fetch(api.offlineFileUrl(job.id), {
    credentials: "include",
    headers,
  });
  if (!res.ok && res.status !== 206) {
    throw new Error("Failed to download compressed video");
  }
  const { bytes } = await writeOfflineVideoFromResponse(
    job.type,
    job.fileId,
    res,
    (written, total) => {
      setTransfer({
        id: job.id,
        type: job.type,
        fileId: job.fileId,
        phase: "downloading",
        progress: total > 0 ? written / total : 0,
        message: "Saving to this iPhone…",
        estimatedBytes: job.estimatedBytes,
        bytes: written,
      });
    },
  );
  return bytes;
}

export async function startOfflineDownload(input: {
  fileId: number;
  type: OfflineWatchType;
}): Promise<void> {
  const id = offlineRecordId(input.type, input.fileId);
  if (transfers.get(id)?.phase === "encoding" || transfers.get(id)?.phase === "downloading") {
    return;
  }
  if (!canStoreOfflineVideos()) {
    throw new Error("This browser cannot store videos offline");
  }

  setTransfer({
    id,
    type: input.type,
    fileId: input.fileId,
    phase: "preparing",
    progress: 0,
    message: "Checking storage…",
    estimatedBytes: null,
    bytes: null,
  });

  try {
    const writable = await hasOpfsWritable();
    if (!writable) {
      throw new Error(
        "Saving videos needs iOS 16.4+ and Add to Home Screen. Update iOS, then share → Add to Home Screen.",
      );
    }
    await requestPersistentStorage();

    const job = await api.startOfflineJob(input.fileId, input.type);
    setTransfer({
      id: job.id,
      type: job.type,
      fileId: job.fileId,
      phase: job.status === "ready" ? "downloading" : "encoding",
      progress: job.progress,
      message:
        job.status === "ready"
          ? "Saving to this iPhone…"
          : "Compressing under 500 MB…",
      estimatedBytes: job.estimatedBytes,
      bytes: job.bytes,
    });

    const ready = job.status === "ready" ? job : await waitForReadyJob(job.id);
    const bytes = await downloadReadyFile(ready);

    const item: OfflineItem = {
      id: ready.id,
      type: ready.type,
      fileId: ready.fileId,
      mediaId: ready.mediaId,
      title: ready.title,
      subtitle: ready.subtitle,
      durationMs: ready.durationMs,
      bytes,
      height: ready.plan.height,
      codec: ready.plan.codec,
      posterPath: ready.posterPath,
      downloadedAt: Date.now(),
      positionMs: 0,
    };
    await saveOfflineItem(item);
    void cachePoster(ready);
    void api.deleteOfflineJob(ready.id).catch(() => {});

    setTransfer({
      id: ready.id,
      type: ready.type,
      fileId: ready.fileId,
      phase: "ready",
      progress: 1,
      message: "Saved for offline",
      estimatedBytes: ready.estimatedBytes,
      bytes,
    });
    window.setTimeout(() => clearTransfer(ready.id), 2500);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    setTransfer({
      id,
      type: input.type,
      fileId: input.fileId,
      phase: "error",
      progress: 0,
      message,
      estimatedBytes: null,
      bytes: null,
    });
    throw err;
  }
}

/** Remove a saved copy from this device only. Server library files stay. */
export async function deleteOfflineDownload(
  type: OfflineWatchType,
  fileId: number,
): Promise<void> {
  const id = offlineRecordId(type, fileId);
  await removeOfflineItem(type, fileId);
  clearTransfer(id);
}

/** Remove every saved copy from this device only. */
export async function deleteAllOfflineDownloads(): Promise<void> {
  const items = await listOfflineItems();
  for (const item of items) {
    await removeOfflineItem(item.type, item.fileId);
    clearTransfer(item.id);
  }
}
