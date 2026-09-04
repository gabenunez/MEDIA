"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Play, Trash2 } from "lucide-react";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useTvMode } from "@/lib/tv-mode";
import {
  deleteOfflineDownload,
  listOfflineItems,
  subscribeOfflineLibrary,
} from "@/lib/offline-downloads";
import {
  getOfflinePosterFile,
  type OfflineItem,
} from "@/lib/offline-storage";
import { formatDuration, formatFileSize } from "@/lib/utils";

export function DownloadsClient() {
  const isTvMode = useTvMode();
  useDocumentTitle("Downloads");
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    const refresh = () => {
      void listOfflineItems().then(async (next) => {
        if (cancelled) return;
        setItems(next);
        const nextPosters: Record<string, string> = {};
        for (const item of next) {
          const file = await getOfflinePosterFile(item.type, item.fileId);
          if (file) {
            const url = URL.createObjectURL(file);
            objectUrls.push(url);
            nextPosters[item.id] = url;
          }
        }
        if (!cancelled) setPosters(nextPosters);
      });
    };

    refresh();
    const unsub = subscribeOfflineLibrary(refresh);
    return () => {
      cancelled = true;
      unsub();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, []);

  if (isTvMode) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-muted-foreground">
        Downloads are for phones and the Home Screen app, not TV.
      </div>
    );
  }

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
                <Download className="h-3.5 w-3.5" />
                Watch without the server
              </p>
              <h1 className="text-3xl font-bold">Downloads</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Titles are compressed under 500 MB so they fit in the iPhone Home Screen app.
                Add MEDIA! to your Home Screen first, then download.
              </p>
            </div>
          </div>
          <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
            {items.length} saved
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing saved yet. Open a movie or episode and tap Download.
          </p>
        ) : (
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
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {item.height}p {item.codec.toUpperCase()} · {formatFileSize(item.bytes)}
                    {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" asChild>
                    <Link href={routes.watch(item.type, item.fileId, item.mediaId ?? undefined)}>
                      <Play className="h-4 w-4 fill-current" /> Play
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove download"
                    onClick={() => void deleteOfflineDownload(item.type, item.fileId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
