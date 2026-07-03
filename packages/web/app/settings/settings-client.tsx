"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  Loader2,
  Lock,
  LogOut,
  XCircle,
  KeyRound,
  Subtitles,
} from "lucide-react";
import { api, type AppSettings } from "@/lib/api";
import { useAuth } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LibraryManager } from "@/components/library-manager";
import { DeckManager } from "@/components/deck-manager";
import { UpdateManager } from "@/components/update-manager";

export function SettingsClient() {
  const { logout, refresh: refreshAuth } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<number | null>(null);
  const [tmdbKey, setTmdbKey] = useState("");
  const [osKey, setOsKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingOsKey, setSavingOsKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [osKeyMessage, setOsKeyMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const loadSettings = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    api
      .getSettings()
      .then(setSettings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSettings();
    const interval = setInterval(() => loadSettings({ silent: true }), 5000);
    return () => clearInterval(interval);
  }, [loadSettings]);

  const handleScan = async (libraryId: number) => {
    setScanning(libraryId);
    try {
      await api.scanLibrary(libraryId);
      loadSettings();
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(null);
    }
  };

  const handleSaveOsKey = async () => {
    setSavingOsKey(true);
    setOsKeyMessage(null);
    try {
      const result = await api.updateOpenSubtitlesKey(osKey);
      setOsKeyMessage(
        result.opensubtitlesConfigured
          ? "OpenSubtitles API key saved"
          : "Key cleared",
      );
      setOsKey("");
      loadSettings();
    } catch (err) {
      setOsKeyMessage(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSavingOsKey(false);
    }
  };

  const handleSaveTmdbKey = async () => {
    setSavingKey(true);
    setKeyMessage(null);
    try {
      const result = await api.updateMetadata(tmdbKey);
      if (result.metadataRefresh?.updated) {
        setKeyMessage(
          `API key saved - updated metadata for ${result.metadataRefresh.updated} title${result.metadataRefresh.updated === 1 ? "" : "s"}`,
        );
      } else if (result.tmdbConfigured) {
        setKeyMessage("API key saved - run Scan on your libraries to fetch metadata");
      } else {
        setKeyMessage("Key saved - verify it works after scanning");
      }
      setTmdbKey("");
      loadSettings();
    } catch (err) {
      setKeyMessage(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSavingKey(false);
    }
  };

  const handleRefreshMetadata = async () => {
    setSavingKey(true);
    setKeyMessage(null);
    try {
      const result = await api.refreshMetadata();
      setKeyMessage(
        result.updated > 0
          ? `Updated metadata for ${result.updated} title${result.updated === 1 ? "" : "s"}`
          : "No unmatched titles found to update",
      );
      loadSettings();
    } catch (err) {
      setKeyMessage(err instanceof Error ? err.message : "Failed to refresh metadata");
    } finally {
      setSavingKey(false);
    }
  };

  const handleSavePassword = async () => {
    setSavingPassword(true);
    setPasswordMessage(null);

    if (password !== confirmPassword) {
      setPasswordMessage("Passwords do not match");
      setSavingPassword(false);
      return;
    }

    try {
      const result = await api.updatePassword({
        password,
        currentPassword: settings?.passwordConfigured ? currentPassword : undefined,
      });
      setPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      setPasswordMessage(
        result.passwordConfigured
          ? "Password saved. You'll need it to access Reel."
          : "Password removed.",
      );
      await refreshAuth();
      loadSettings();
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Failed to save password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRemovePassword = async () => {
    setSavingPassword(true);
    setPasswordMessage(null);
    try {
      await api.updatePassword({
        currentPassword,
        remove: true,
      });
      setCurrentPassword("");
      setPasswordMessage("Password removed.");
      await refreshAuth();
      loadSettings();
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Failed to remove password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const initialLoad = loading && !settings;

  return (
    <div className="space-y-6">
      <Card className="min-h-[12rem]">
        <CardContent className="pt-6">
          {initialLoad ? (
            <SettingsCardSkeleton lines={4} />
          ) : (
            <LibraryManager
              libraries={settings?.libraries ?? []}
              onChange={() => loadSettings()}
              scanning={scanning}
              onScan={handleScan}
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-h-[10rem]">
        <CardContent className="pt-6">
          {initialLoad ? (
            <SettingsCardSkeleton lines={3} />
          ) : (
            <DeckManager
              libraries={settings?.libraries ?? []}
              decks={settings?.decks ?? []}
              onChange={() => loadSettings()}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {initialLoad ? (
            <SettingsCardSkeleton lines={5} />
          ) : (
            <>
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Password</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Require a password to access Reel. When enabled, all pages, streams,
              and API routes are protected.
            </p>

            {settings?.passwordConfigured ? (
              <p className="mb-4 text-sm text-muted-foreground">
                Status:{" "}
                <span className="font-medium text-accent">Password protection enabled</span>
              </p>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">
                No password set — Reel is open to anyone on this network.
              </p>
            )}

            {settings?.passwordConfigured && (
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="mb-3"
                autoComplete="current-password"
              />
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={settings?.passwordConfigured ? "New password" : "Password"}
                autoComplete="new-password"
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={handleSavePassword}
                disabled={
                  savingPassword ||
                  !password.trim() ||
                  !confirmPassword.trim() ||
                  (settings?.passwordConfigured && !currentPassword.trim())
                }
              >
                {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {settings?.passwordConfigured ? "Change password" : "Set password"}
              </Button>

              {settings?.passwordConfigured && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleRemovePassword}
                    disabled={savingPassword || !currentPassword.trim()}
                  >
                    Remove password
                  </Button>
                  <Button variant="ghost" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </Button>
                </>
              )}
            </div>

            {passwordMessage && (
              <p className="mt-2 text-sm text-muted-foreground">{passwordMessage}</p>
            )}
            </>
          )}
          </CardContent>
        </Card>

        {!initialLoad && (
          <>
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">TMDB Metadata</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Get a free API key from{" "}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noreferrer"
                className="text-primary transition-colors hover:text-accent"
              >
                themoviedb.org
              </a>{" "}
              for posters, descriptions, and cast info.
            </p>

            {settings?.metadata.tmdbConfigured && settings.metadata.tmdbApiKeyPreview && (
              <p className="mb-3 text-sm text-muted-foreground">
                Current key:{" "}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-accent">
                  {settings.metadata.tmdbApiKeyPreview}
                </code>
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Paste your TMDB API key"
              />
              <Button
                onClick={handleSaveTmdbKey}
                disabled={savingKey || !tmdbKey.trim()}
                className="shrink-0"
              >
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save key
              </Button>
            </div>
            {keyMessage && (
              <p className="mt-2 text-sm text-muted-foreground">{keyMessage}</p>
            )}

            {settings?.metadata.tmdbConfigured && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleRefreshMetadata}
                disabled={savingKey}
              >
                {savingKey ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Refresh metadata
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Subtitles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">OpenSubtitles</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Search and download subtitles while watching. Get a free API key from OpenSubtitles:
            </p>
            <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Create an account or log in at{" "}
                <a
                  href="https://www.opensubtitles.com/en/users/sign_up"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary transition-colors hover:text-accent"
                >
                  opensubtitles.com
                </a>
              </li>
              <li>
                Open your profile →{" "}
                <a
                  href="https://www.opensubtitles.com/en/consumers"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary transition-colors hover:text-accent"
                >
                  API consumers
                </a>
              </li>
              <li>
                Click <strong className="text-foreground">New consumer</strong>, name your app
                (e.g. Reel), and submit
              </li>
              <li>Copy the API key shown and paste it below</li>
            </ol>

            {settings?.subtitles.opensubtitlesConfigured &&
              settings.subtitles.opensubtitlesApiKeyPreview && (
                <p className="mb-3 text-sm text-muted-foreground">
                  Current key:{" "}
                  <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-accent">
                    {settings.subtitles.opensubtitlesApiKeyPreview}
                  </code>
                </p>
              )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                value={osKey}
                onChange={(e) => setOsKey(e.target.value)}
                placeholder="Paste your OpenSubtitles API key"
              />
              <Button
                onClick={handleSaveOsKey}
                disabled={savingOsKey || !osKey.trim()}
                className="shrink-0"
              >
                {savingOsKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save key
              </Button>
            </div>
            {osKeyMessage && (
              <p className="mt-2 text-sm text-muted-foreground">{osKeyMessage}</p>
            )}
          </CardContent>
        </Card>

        <UpdateManager />

        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">System Status</h2>
            </div>
            <div className="space-y-3">
              <StatusRow
                label="FFmpeg"
                ok={settings?.ffmpegAvailable ?? false}
                okText="Available for transcoding"
                failText="Not found - install with: brew install ffmpeg"
              />
              <StatusRow
                label="TMDB API"
                ok={settings?.metadata.tmdbConfigured ?? false}
                okText="Configured"
                failText="Add your API key above for rich metadata"
              />
              <StatusRow
                label="OpenSubtitles API"
                ok={settings?.subtitles.opensubtitlesConfigured ?? false}
                okText="Configured"
                failText="Add your API key above for online subtitle search"
              />
            </div>
          </CardContent>
        </Card>
          </>
        )}
    </div>
  );
}

function SettingsCardSkeleton({ lines }: { lines: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div className="flex items-center gap-3 border-l border-border/80 py-2 pl-4">
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-accent" />
      ) : (
        <XCircle className="h-5 w-5 text-red-400" />
      )}
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{ok ? okText : failText}</p>
      </div>
    </div>
  );
}
