"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, HardDrive, Play, Trash2 } from "lucide-react";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useTvMode } from "@/lib/tv-mode";
import {
  deleteAllOfflineDownloads,
  deleteOfflineDownload,
  listOfflineItems,
  listOfflineTransfers,
  subscribeOfflineLibrary,
  subscribeOfflineTransfers,
  type OfflineTransfer,
} from "@/lib/offline-downloads";
import {
  estimateOfflineQuota,
  getOfflinePosterFile,
  getOfflineVideoFile,
  type OfflineItem,
} from "@/lib/offline-storage";
import { formatDuration } from "@/lib/utils";
import {
  REMOVE_ALL_LOCAL_DOWNLOADS_CONFIRM,
  REMOVE_LOCAL_DOWNLOAD_CONFIRM,
  formatDownloadSize,
  sumOfflineBytes,
} from "@/lib/offline-library";

export function DownloadsClient() {
  const isTvMode = useTvMode();
  useDocumentTitle("Downloads");
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [transfers, setTransfers] = useState<OfflineTransfer[]>([]);
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    const refresh = () => {
      setTransfers(listOfflineTransfers());
      void Promise.all([listOfflineItems(), estimateOfflineQuota()]).then(
        async ([listed, storage]) => {
          if (cancelled) return;
          const withSizes = await Promise.all(
            listed.map(async (item) => {
              const file = await getOfflineVideoFile(item.type, item.fileId);
              return file ? { ...item, bytes: file.size } : item;
            }),
          );
          if (cancelled) return;
          setItems(withSizes);
          setQuota(storage);

          const nextPosters: Record<string, string> = {};
          for (const item of withSizes) {
            const file = await getOfflinePosterFile(item.type, item.fileId);
            if (file) {
              const url = URL.createObjectURL(file);
              objectUrls.push(url);
              nextPosters[item.id] = url;
            }
          }
          if (!cancelled) setPosters(nextPosters);
        },
      );
    };

    refresh();
    const unsubLib = subscribeOfflineLibrary(refresh);
    const unsubTx = subscribeOfflineTransfers(refresh);
    return () => {
      cancelled = true;
      unsubLib();
      unsubTx();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, []);

  const totalBytes = useMemo(() => sumOfflineBytes(items), [items]);
  const activeTransfers = transfers.filter(
    (transfer) =>
      transfer.phase === "preparing" ||
      transfer.phase === "encoding" ||
      transfer.phase === "downloading",
  );

  if (isTvMode) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-muted-foreground">
        Downloads are for phones and the Home Screen app, not TV.
      </div>
    );
  }

  const removeOne = async (item: OfflineItem) => {
    if (!window.confirm(REMOVE_LOCAL_DOWNLOAD_CONFIRM)) return;
    setRemovingId(item.id);
    try {
      await deleteOfflineDownload(item.type, item.fileId);
    } finally {
      setRemovingId(null);
    }
  };

  const removeAll = async () => {
    if (!items.length) return;
    if (!window.confirm(REMOVE_ALL_LOCAL_DOWNLOADS_CONFIRM)) return;
    setRemovingId("*");
    try {
      await deleteAllOfflineDownloads();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={routes.home()}>
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <p className="mb-1 flex items-center gap-2 font-mono text-[0.68rem] uppercase text-accent">
                <HardDrive className="h-3.5 w-3.5" />
                On this device
              </p>
              <h1 className="text-3xl font-bold">Downloads</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Manage compressed copies saved for offline. Removing a title
                frees space here only — your MEDIA! library on the server stays.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">
              {formatDownloadSize(totalBytes)}
            </p>
            <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
              {items.length} saved
              {quota && quota.quota > 0
                ? ` · ${formatDownloadSize(quota.usage)} of ${formatDownloadSize(quota.quota)} used`
                : null}
            </p>
          </div>
        </div>

        {activeTransfers.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold">In progress</h2>
            <div className="space-y-3">
              {activeTransfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="rounded-md border border-border/80 bg-card/70 p-3 sm:p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm">{transfer.message ?? "Working…"}</p>
                    <p className="shrink-0 font-mono text-sm tabular-nums">
                      {formatDownloadSize(transfer.bytes ?? 0)}
                      {transfer.estimatedBytes
                        ? ` / ${formatDownloadSize(transfer.estimatedBytes)}`
                        : ""}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.round((transfer.progress || 0) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {items.length === 0 && activeTransfers.length === 0 ? (
          <div className="border-y border-border/70 py-16 text-center">
            <Download className="mx-auto mb-4 h-12 w-12 text-accent" />
            <h2 className="mb-2 text-xl font-semibold">Nothing on this device</h2>
            <p className="mb-6 text-muted-foreground">
              Open a movie or episode and tap Download. Files stay under 500 MB
              so they fit on an iPhone.
            </p>
            <Button asChild>
              <Link href={routes.home()}>Browse home</Link>
            </Button>
          </div>
        ) : items.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Saved on this device</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void removeAll()}
                disabled={removingId !== null}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove all from this device
              </Button>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-md border border-border/80 bg-card/70 p-3 sm:p-4"
                >
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                    {posters[item.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={posters[item.id]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.height}p {item.codec === "hevc" ? "HEVC" : "H.264"}
                      {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}
                      {item.subtitle ? ` · ${item.subtitle}` : ""}
                    </p>
                  </div>
                  <p className="hidden shrink-0 text-right text-base font-semibold tabular-nums sm:block">
                    {formatDownloadSize(item.bytes)}
                  </p>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <p className="text-sm font-semibold tabular-nums sm:hidden">
                      {formatDownloadSize(item.bytes)}
                    </p>
                    <Button size="sm" asChild>
                      <Link
                        href={routes.watch(
                          item.type,
                          item.fileId,
                          item.mediaId ?? undefined,
                        )}
                      >
                        <Play className="h-4 w-4 fill-current" /> Play
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={removingId === item.id || removingId === "*"}
                      aria-label={`Remove ${item.title} from this device`}
                      onClick={() => void removeOne(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
