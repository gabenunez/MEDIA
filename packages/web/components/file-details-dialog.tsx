"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { StreamInfo, StreamQuality } from "@/lib/api";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import {
  formatBitrate,
  formatDuration,
  formatFileSize,
  formatResolution,
} from "@/lib/utils";

interface FileDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  streamInfo: StreamInfo | null;
  title: string;
  mediaId?: number | null;
  playbackQuality: StreamQuality;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border/70 py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function FileDetailsDialog({
  open,
  onClose,
  streamInfo,
  title,
  mediaId,
  playbackQuality,
}: FileDetailsDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">File details</h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">{title}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-y-auto px-5 py-2">
          {!streamInfo ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading file details...
            </p>
          ) : (
            <>
              {streamInfo.isSymlink ? (
                <div className="mb-4 mt-2 rounded-md border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  <p className="font-medium">Symbolic link</p>
                  <p className="mt-1 text-amber-100/90">
                    This file is a symlink. MEDIA! plays from the target on disk
                    {streamInfo.symlinkTarget ? (
                      <>
                        {": "}
                        <span className="break-all font-mono text-xs">
                          {streamInfo.symlinkTarget}
                        </span>
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                </div>
              ) : null}
              <dl>
                <DetailRow label="File name" value={streamInfo.fileName} />
                <DetailRow
                  label="Location"
                  value={
                    streamInfo.isSymlink
                      ? `${streamInfo.filePath} (symlink)`
                      : streamInfo.filePath
                  }
                />
              <DetailRow label="File size" value={formatFileSize(streamInfo.fileSize)} />
              <DetailRow
                label="Duration"
                value={formatDuration(streamInfo.durationMs)}
              />
              <DetailRow
                label="Resolution"
                value={formatResolution(streamInfo.width, streamInfo.height)}
              />
              <DetailRow
                label="Video codec"
                value={streamInfo.videoCodec ?? "Unknown"}
              />
              <DetailRow
                label="Audio codec"
                value={streamInfo.audioCodec ?? "Unknown"}
              />
              <DetailRow label="Bitrate" value={formatBitrate(streamInfo.bitrate)} />
              <DetailRow label="Container" value={streamInfo.mimeType} />
              <DetailRow
                label="Type"
                value={streamInfo.type === "movie" ? "Movie file" : "TV episode"}
              />
              <DetailRow
                label="Playback"
                value={
                  playbackQuality === "original"
                    ? "Direct stream (original quality)"
                    : `Transcoded (${playbackQuality.toUpperCase()})`
                }
              />
            </dl>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          {mediaId ? (
            <Button variant="outline" asChild>
              <Link href={routes.media(mediaId)} onClick={onClose}>
                Open title page
              </Link>
            </Button>
          ) : null}
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
