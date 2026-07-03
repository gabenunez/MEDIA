import { Suspense } from "react";
import { TvSearchClient } from "./client";
import { Loader2 } from "lucide-react";

export default function TvSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }
    >
      <TvSearchClient />
    </Suspense>
  );
}
