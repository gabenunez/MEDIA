import { useEffect, useState } from "react";
import { api, type MediaItem } from "@/lib/api";

type SearchResponse = { query: string; attempt: number } & (
  | { status: "ready"; items: MediaItem[] }
  | { status: "error" }
);

export function useTvSearchResults(query: string) {
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!query) return;
    let active = true;
    void api.search(query, { mode: "tv" }).then(
      ({ results }) => {
        if (active) setResponse({ query, attempt, status: "ready", items: results });
      },
      () => {
        if (active) setResponse({ query, attempt, status: "error" });
      },
    );
    return () => { active = false; };
  }, [query, attempt]);

  const current = response?.query === query && response.attempt === attempt ? response : null;
  return {
    status: !query ? "idle" as const : current?.status ?? "loading" as const,
    results: current?.status === "ready" ? current.items : null,
    retry: () => setAttempt((previous) => previous + 1),
  };
}
