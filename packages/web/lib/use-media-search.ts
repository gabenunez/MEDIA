import { useEffect, useRef, useState } from "react";
import { api, type MediaItem } from "@/lib/api";

interface UseMediaSearchOptions {
  minLength?: number;
  debounceMs?: number;
}

export function useMediaSearch(
  query: string,
  { minLength = 2, debounceMs = 300 }: UseMediaSearchOptions = {},
) {
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < minLength) {
      requestIdRef.current += 1;
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSearched(false);

    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      api
        .search(trimmed)
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setResults(data.results);
          setSearched(true);
        })
        .catch((err) => {
          if (requestId !== requestIdRef.current) return;
          console.warn("Search failed", err);
          setResults([]);
          setSearched(true);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [query, minLength, debounceMs]);

  return { results, loading, searched };
}
