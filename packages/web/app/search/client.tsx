"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTvMode } from "@/lib/tv-mode";
import { TvSearchView } from "@/components/tv/views/search-view";

export function SearchClient() {
  const isTvMode = useTvMode();
  const router = useRouter();

  useEffect(() => {
    if (!isTvMode) {
      router.replace("/");
    }
  }, [isTvMode, router]);

  if (isTvMode) {
    return <TvSearchView />;
  }

  return null;
}
