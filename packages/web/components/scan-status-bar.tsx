"use client";

import { usePathname } from "next/navigation";
import { useScanStatus } from "@/components/scan-status-provider";
import { ScanProgressBanner } from "@/components/scan-progress";

export function ScanStatusBar() {
  const pathname = usePathname();
  const { activeScan } = useScanStatus();

  if (!activeScan || pathname === "/" || pathname.startsWith("/watch")) {
    return null;
  }

  return (
    <div className="border-b border-border/70 bg-background/95 px-4 py-2 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <ScanProgressBanner scan={activeScan} />
      </div>
    </div>
  );
}
