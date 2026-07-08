"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";
import { useTvMode } from "@/lib/tv-mode";
import { TvSearchView } from "@/components/tv/views/search-view";

export function SearchClient() {
  const isTvMode = useTvMode();
  const router = useRouter();

  useEffect(() => {
    if (!isTvMode) {
      router.replace(routes.home());
    }
  }, [isTvMode, router]);

  if (isTvMode) {
    return <TvSearchView />;
  }

  return null;
}
