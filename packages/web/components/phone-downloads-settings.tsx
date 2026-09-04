"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HardDrive } from "lucide-react";
import { SettingsSection } from "@/components/settings-shell";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import {
  listOfflineItems,
  subscribeOfflineLibrary,
} from "@/lib/offline-downloads";
import { formatDownloadSize, sumOfflineBytes } from "@/lib/offline-library";
import { useTvMode } from "@/lib/tv-mode";

export function PhoneDownloadsSettings() {
  const isTvMode = useTvMode();
  const [count, setCount] = useState(0);
  const [bytes, setBytes] = useState(0);

  useEffect(() => {
    const refresh = () => {
      void listOfflineItems().then((items) => {
        setCount(items.length);
        setBytes(sumOfflineBytes(items));
      });
    };
    refresh();
    return subscribeOfflineLibrary(refresh);
  }, []);

  if (isTvMode) return null;

  return (
    <SettingsSection
      icon={HardDrive}
      title="Downloads on this device"
      description="Compressed copies saved for offline. Removing them only frees space on this phone or browser — the server library is untouched."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{formatDownloadSize(bytes)}</span>
          <span className="text-muted-foreground">
            {" "}
            · {count} {count === 1 ? "title" : "titles"}
          </span>
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={routes.downloads()}>Manage downloads</Link>
        </Button>
      </div>
    </SettingsSection>
  );
}
