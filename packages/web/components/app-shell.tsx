"use client";

import { AuthProvider } from "@/components/auth-gate";
import { ScanStatusProvider } from "@/components/scan-status-provider";
import { Navbar } from "@/components/navbar";
import { ScanStatusBar } from "@/components/scan-status-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ScanStatusProvider>
        <Navbar />
        <ScanStatusBar />
        <main>{children}</main>
      </ScanStatusProvider>
    </AuthProvider>
  );
}
