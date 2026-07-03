import { Suspense } from "react";
import { TvWatchClient } from "./client";

export default function TvWatchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-black text-white">
          Loading...
        </div>
      }
    >
      <TvWatchClient />
    </Suspense>
  );
}
