"use client";

import dynamic from "next/dynamic";

const SettingsClient = dynamic(
  () => import("./settings-client").then((mod) => mod.SettingsClient),
  {
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  },
);

export function SettingsPageClient() {
  return <SettingsClient />;
}
