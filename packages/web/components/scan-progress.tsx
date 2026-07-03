"use client";

import { Loader2 } from "lucide-react";
import type { ServerStatus } from "@/lib/api";

type ActiveScan = NonNullable<ServerStatus["activeScan"]>;

export function ScanProgressBanner({
  scan,
  className = "",
}: {
  scan: ActiveScan;
  className?: string;
}) {
  const progress = Math.min(100, Math.max(0, scan.progress));

  return (
    <div
      className={`overflow-hidden rounded-md border border-primary/35 bg-primary/10 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Scanning ${scan.libraryName}, ${progress} percent complete`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">Scanning {scan.libraryName}</p>
          <p className="text-sm text-muted-foreground">
            {scan.message ?? "Working…"} ({progress}%)
          </p>
        </div>
      </div>
      <div className="h-1 bg-primary/15">
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
