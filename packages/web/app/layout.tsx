import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { APP_NAME } from "@/lib/document-title";
import { TV_CRITICAL_CSS, TV_MODE_BOOTSTRAP_SCRIPT } from "@/lib/tv-mode-detect";

const inter = Inter({
  subsets: ["latin"],
  // swap always paints immediately with fallback, then applies Inter when ready.
  // optional can permanently skip Inter on slow TV/WebView networks.
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "Self-hosted movies and TV streaming",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1415",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: TV_CRITICAL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: TV_MODE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
