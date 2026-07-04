import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { APP_NAME } from "@/lib/document-title";
import {
  isTvUserAgent,
  TV_MODE_BOOTSTRAP_SCRIPT,
  TV_MODE_HTML_CLASS,
} from "@/lib/tv-mode-detect";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "Self-hosted movies and TV streaming",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") ?? "";
  const serverTvMode = isTvUserAgent(userAgent);

  return (
    <html
      lang="en"
      className={serverTvMode ? `dark ${TV_MODE_HTML_CLASS}` : "dark"}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TV_MODE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
