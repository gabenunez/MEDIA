"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteOfflineDownload,
  getOfflineItem,
  getOfflineTransfer,
  startOfflineDownload,
  subscribeOfflineLibrary,
  subscribeOfflineTransfers,
} from "@/lib/offline-downloads";
import { cn } from "@/lib/utils";
import { useTvMode } from "@/lib/tv-mode";
import type { OfflineWatchType } from "@/lib/offline-storage";
import {
  REMOVE_LOCAL_DOWNLOAD_CONFIRM,
  formatDownloadSize,
} from "@/lib/offline-library";

export function OfflineDownloadButton({
  fileId,
  type,
  size = "lg",
  className,
}: {
  fileId: number;
  type: OfflineWatchType;
  size?: "sm" | "lg" | "icon";
  className?: string;
}) {
  const isTvMode = useTvMode();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("Download");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getOfflineItem(type, fileId).then((item) => {
        if (cancelled) return;
        setSaved(Boolean(item));
        const transfer = getOfflineTransfer(type, fileId);
        if (transfer && transfer.phase !== "idle" && transfer.phase !== "ready") {
          setBusy(transfer.phase === "encoding" || transfer.phase === "downloading" || transfer.phase === "preparing");
          setLabel(transfer.message ?? "Working…");
          setError(transfer.phase === "error" ? transfer.message : null);
          return;
        }
        setBusy(false);
        if (item) {
          setLabel(`Saved · ${formatDownloadSize(item.bytes)}`);
          setError(null);
        } else {
          setLabel("Download");
        }
      });
    };
    refresh();
    const unsubLib = subscribeOfflineLibrary(refresh);
    const unsubTx = subscribeOfflineTransfers(refresh);
    return () => {
      cancelled = true;
      unsubLib();
      unsubTx();
    };
  }, [fileId, type]);

  if (isTvMode) return null;

  const onClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    if (saved) {
      if (!window.confirm(REMOVE_LOCAL_DOWNLOAD_CONFIRM)) return;
      await deleteOfflineDownload(type, fileId);
      return;
    }
    setBusy(true);
    try {
      await startOfflineDownload({ fileId, type });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant={saved ? "outline" : "secondary"}
        size={size}
        onClick={(event) => void onClick(event)}
        disabled={busy}
        className="relative z-10"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          size === "icon" ? (
            <Trash2 className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )
        ) : (
          <Download className="h-4 w-4" />
        )}
        {size !== "icon" ? <span className="max-w-[11rem] truncate">{label}</span> : null}
      </Button>
      {error ? <p className="max-w-[16rem] text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
