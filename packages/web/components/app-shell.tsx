"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/auth-gate";
import { AudioUnlock } from "@/components/audio-unlock";
import { ThemeMusicSettingsProvider } from "@/components/theme-music-settings";
import { ScanStatusProvider } from "@/components/scan-status-provider";
import { UpdateStatusProvider } from "@/components/update-status-provider";
import { UpdateModal } from "@/components/update-modal";
import { Navbar } from "@/components/navbar";
import { ScanStatusBar } from "@/components/scan-status-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTv = pathname.startsWith("/tv");

  if (isTv) {
    return (
      <AuthProvider>
        <ThemeMusicSettingsProvider>
          <AudioUnlock />
          {children}
        </ThemeMusicSettingsProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
