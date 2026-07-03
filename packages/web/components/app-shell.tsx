"use client";

import { AuthProvider } from "@/components/auth-gate";
import { AudioUnlock } from "@/components/audio-unlock";
import { ThemeMusicSettingsProvider } from "@/components/theme-music-settings";
import { SubtitleStylesProvider } from "@/components/subtitle-style-settings";
import { ScanStatusProvider } from "@/components/scan-status-provider";
import { UpdateStatusProvider } from "@/components/update-status-provider";
import { UpdateModal } from "@/components/update-modal";
import { Navbar } from "@/components/navbar";
import { ScanStatusBar } from "@/components/scan-status-bar";
import { TvShell } from "@/components/tv/tv-shell";
import { TvModeProvider, useTvMode } from "@/lib/tv-mode";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const isTvMode = useTvMode();

  if (isTvMode) {
    return (
      <AuthProvider>
        <SubtitleStylesProvider>
          <ThemeMusicSettingsProvider>
            <AudioUnlock />
            <TvShell>{children}</TvShell>
          </ThemeMusicSettingsProvider>
        </SubtitleStylesProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <SubtitleStylesProvider>
        <ThemeMusicSettingsProvider>
          <AudioUnlock />
          <ScanStatusProvider>
            <UpdateStatusProvider>
              <Navbar />
              <ScanStatusBar />
              <UpdateModal />
              <main>{children}</main>
            </UpdateStatusProvider>
          </ScanStatusProvider>
        </ThemeMusicSettingsProvider>
      </SubtitleStylesProvider>
    </AuthProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TvModeProvider>
      <AppShellInner>{children}</AppShellInner>
    </TvModeProvider>
  );
}
