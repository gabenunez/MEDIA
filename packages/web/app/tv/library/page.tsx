import { Suspense } from "react";
import { TvLibraryClient } from "./client";
import { Loader2 } from "lucide-react";

export default function TvLibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }
    >
      <TvLibraryClient />
    </Suspense>
  );
}
