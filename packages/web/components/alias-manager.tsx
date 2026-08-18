"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import {
  api,
  type AliasCandidate,
  type AliasScanResult,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FolderPicker } from "@/components/folder-picker";
import { SettingsSection } from "@/components/settings-shell";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function candidateLabel(item: AliasCandidate): string {
  if (item.kind === "episode") {
    const season = String(item.season ?? 1).padStart(2, "0");
    const episode = String(item.episode ?? 0).padStart(2, "0");
    return `${item.title} · S${season}E${episode}`;
  }
  return item.year ? `${item.title} (${item.year})` : item.title;
}

export function AliasManager({
  initialPath,
  onPathChange,
}: {
  initialPath: string;
  onPathChange?: (path: string) => void;
}) {
  const [path, setPath] = useState(initialPath);
  const [scanning, setScanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scan, setScan] = useState<AliasScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPath(initialPath);
  }, [initialPath]);

  const selectedCount = useMemo(
    () => scan?.candidates.filter((item) => selected.has(item.sourcePath)).length ?? 0,
    [scan, selected],
  );

  const handleScan = async () => {
    setScanning(true);
    setMessage(null);
    try {
      const result = await api.scanMissingAliases(path.trim() || undefined);
      setScan(result);
      setPath(result.downloadPath);
      onPathChange?.(result.downloadPath);
      setSelected(new Set(result.candidates.map((item) => item.sourcePath)));
      if (result.candidates.length === 0) {
        setMessage(
          result.scanned === 0
            ? "No media files found in that folder."
            : `Scan complete. ${result.alreadyAliased} already aliased; nothing left to add.`,
        );
      }
    } catch (err) {
      setScan(null);
      setSelected(new Set());
      setMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const toggle = (sourcePath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sourcePath)) next.delete(sourcePath);
      else next.add(sourcePath);
      return next;
    });
  };

  const setAll = (on: boolean) => {
    if (!scan) return;
    setSelected(on ? new Set(scan.candidates.map((item) => item.sourcePath)) : new Set());
  };

  const handleCreate = async () => {
    if (!scan || selectedCount === 0) return;
    setCreating(true);
    setMessage(null);
    try {
      const result = await api.createAliases([...selected]);
      const createdSet = new Set(selected);
      for (const failure of result.failed) createdSet.delete(failure.sourcePath);
      setScan({
        ...scan,
        candidates: scan.candidates.filter((item) => !createdSet.has(item.sourcePath)),
        alreadyAliased: scan.alreadyAliased + result.created,
      });
      setSelected(new Set(result.failed.map((item) => item.sourcePath)));
      const parts = [
        result.created > 0 ? `${result.created} alias${result.created === 1 ? "" : "es"} created` : null,
        result.failed.length > 0 ? `${result.failed.length} failed` : null,
      ].filter(Boolean);
      const failureNote =
        result.failed[0] ? ` ${result.failed[0].error}` : "";
      setMessage(`${parts.join(", ") || "Nothing created."}${failureNote}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create aliases");
    } finally {
      setCreating(false);
    }
  };

  return (
    <SettingsSection
      icon={Link2}
      title="Missing download aliases"
      description="Point MEDIA! at your torrent download folder, scan for media files that do not yet have a library alias, then create the missing ones."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Download folder</label>
          <FolderPicker value={path} onChange={setPath} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={scanning || !path.trim()}
            onClick={() => void handleScan()}
          >
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              "Scan for missing aliases"
            )}
          </Button>
          <Button
            type="button"
            disabled={creating || scanning || selectedCount === 0}
            onClick={() => void handleCreate()}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              `Create ${selectedCount} alias${selectedCount === 1 ? "" : "es"}`
            )}
          </Button>
        </div>

        {scan ? (
          <p className="text-xs text-muted-foreground">
            {scan.scanned} media file{scan.scanned === 1 ? "" : "s"} scanned
            {scan.alreadyAliased > 0 ? ` · ${scan.alreadyAliased} already aliased` : ""}
            {scan.skipped > 0 ? ` · ${scan.skipped} skipped` : ""}
            {scan.candidates.length > 0
              ? ` · ${scan.candidates.length} without an alias`
              : ""}
          </p>
        ) : null}

        {scan && scan.candidates.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAll(true)}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>
                Deselect all
              </Button>
            </div>
            <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-2">
              {scan.candidates.map((item) => (
                <li key={item.sourcePath}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                    <input
                      type="checkbox"
                      checked={selected.has(item.sourcePath)}
                      onChange={() => toggle(item.sourcePath)}
                      className="mt-1 rounded border-border"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {candidateLabel(item)}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {item.fileName} · {formatBytes(item.size)} · {item.libraryName}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground/80">
                        {item.aliasPath}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </SettingsSection>
  );
}
