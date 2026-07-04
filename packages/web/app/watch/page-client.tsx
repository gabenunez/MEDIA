"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const WatchClient = dynamic(
  () => import("./client").then((mod) => mod.WatchClient),
  {
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  },
);

export function WatchPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-black">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <WatchClient />
    </Suspense>
  );
}
