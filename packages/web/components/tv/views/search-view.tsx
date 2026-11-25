"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Loader2, Search, X } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { TvEmptyState, TvPageHeader, TvPageShell } from "@/components/tv/tv-page-header";
import { TvGrid } from "@/components/tv/tv-row";
import { TvPoster } from "@/components/tv/tv-poster";
import { setAndroidSearchKeyboardVisible } from "@/lib/android-bridge";
import { useDocumentTitle } from "@/lib/use-document-title";
import { markTvBootContentReady } from "@/lib/tv-boot-ready";
import { focusTvItem } from "@/lib/tv-focus";
import {
  clearTvSearchRecents,
  normalizeTvSearchQuery,
  readTvSearchRecents,
  readTvSearchResult,
  rememberTvSearch,
  rememberTvSearchResult,
  setTvSearchQuery,
  TV_SEARCH_QUERY_LIMIT,
} from "@/lib/tv-search";
import { useTvSearchResults } from "@/lib/use-tv-search-results";

export function TvSearchView() {
  useDocumentTitle("Search");
  const query = normalizeTvSearchQuery(useSearchParams().get("q"));
  const { status, results, retry } = useTvSearchResults(query);
  const [draft, setDraft] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const editing = draft !== null;
  const searchButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultsArea = useRef<HTMLElement>(null);
  const focusAfterSearch = useRef<{ resultId: number | null } | null>(null);

  useEffect(() => {
    setRecents(query ? rememberTvSearch(query) : readTvSearchRecents());
  }, [query]);

  useLayoutEffect(() => {
    // The auth gate has released this screen. Reveal it before focusing:
    // Chromium won't focus a control in the hidden TV startup shell.
    markTvBootContentReady();
    // Only an explicit search or return through history can move focus when
    // results arrive. A request finishing while browsing is never a focus cue.
    focusAfterSearch.current = query ? { resultId: readTvSearchResult() } : null;
  }, [query]);

  useLayoutEffect(() => {
    if (!editing && searchButton.current) focusTvItem(searchButton.current);
  }, [editing, query]);

  useLayoutEffect(() => {
    if (!editing) return;
    const field = input.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
    setAndroidSearchKeyboardVisible(true);
    return () => setAndroidSearchKeyboardVisible(false);
  }, [editing]);

  useLayoutEffect(() => {
    const intent = focusAfterSearch.current;
    if (editing || status === "loading" || !intent) return;
    focusAfterSearch.current = null;
    if (status !== "ready") return;

    const active = document.activeElement;
    if (active && active !== searchButton.current && active !== document.body) return;

    const restored = intent.resultId == null ? null : resultsArea.current?.querySelector<HTMLElement>(
      `[data-tv-media-id="${intent.resultId}"]`,
    );
    const target = restored ?? resultsArea.current?.querySelector<HTMLElement>("[data-tv-media-id]");
    if (target) focusTvItem(target);
  }, [editing, query, results, status]);

  useEffect(() => {
    if (!editing) return;
    const cancel = () => {
      setDraft(null);
      return true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape" || event.key === "BrowserBack" || event.key === "GoBack") {
        event.preventDefault();
        cancel();
      }
    };
    window.__mediaSearchHandleBack = cancel;
    window.addEventListener("keydown", onKeyDown);
    return () => {
      delete window.__mediaSearchHandleBack;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editing]);

  function runSearch(value: string) {
    const next = normalizeTvSearchQuery(value);
    setDraft(null);
    if (next !== query) {
      setTvSearchQuery(next);
    } else if (next) {
      focusAfterSearch.current = { resultId: null };
      if (status === "error") retry();
    }
  }

  return (
    <TvPageShell>
      <TvPageHeader title="Search" />

      <div className="mb-8 max-w-3xl">
        {editing ? (
          <form
            data-tv-row=""
            data-tv-content-row=""
            className="flex items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              // Only the editor or its Search button can submit. A repeated
              // remote OK dispatched on window must not close the keyboard.
              const value = normalizeTvSearchQuery(input.current?.value);
              if (value) runSearch(value);
            }}
          >
            <input
              ref={input}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              maxLength={TV_SEARCH_QUERY_LIMIT}
              value={draft ?? ""}
              data-tv-search-input=""
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Movie or TV title"
              placeholder="Movie or TV title"
              className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-primary bg-card px-4 text-lg outline-none"
            />
            <TvFocusButton type="submit" className="min-h-14 bg-card px-5 text-lg">
              Search
            </TvFocusButton>
            <TvFocusButton aria-label="Cancel editing" className="min-h-14 min-w-14 bg-card" onClick={() => setDraft(null)}>
              <X className="mx-auto h-5 w-5" aria-hidden />
            </TvFocusButton>
          </form>
        ) : (
          <div data-tv-row="" data-tv-content-row="" className="flex gap-3">
            <TvFocusButton
              ref={searchButton}
              onClick={() => setDraft(query)}
              aria-label={query ? `Edit search: ${query}` : undefined}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 bg-card px-4 text-left text-lg"
            >
              <Search className="h-5 w-5 shrink-0" aria-hidden />
              <span className="truncate">{query || "Search titles"}</span>
              {query && <span className="ml-auto shrink-0 text-base opacity-75">Edit</span>}
            </TvFocusButton>
            {query && (
              <TvFocusButton onClick={() => runSearch("")} className="min-h-14 bg-card px-5 text-lg">
                Clear
              </TvFocusButton>
            )}
          </div>
        )}
        {!query && !editing && (
          <p className="mt-3 text-base text-muted-foreground">Press OK to type, or use your remote’s mic if it supports voice search.</p>
        )}
      </div>

      {!query && !editing && recents.length > 0 && (
        <section aria-labelledby="tv-search-recent-heading" className="max-w-3xl">
          <h2 id="tv-search-recent-heading" className="mb-3 text-lg font-semibold">Recent searches</h2>
          {recents.map((recent) => (
            <div key={recent} data-tv-row="" data-tv-content-row="" className="mb-2">
              <TvFocusButton onClick={() => runSearch(recent)} className="flex min-h-12 w-full items-center gap-3 bg-card px-4 text-left text-base">
                <History className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{recent}</span>
              </TvFocusButton>
            </div>
          ))}
          <div data-tv-row="" data-tv-content-row="">
            <TvFocusButton
              className="mt-2 min-h-12 px-4 text-base"
              onClick={() => {
                clearTvSearchRecents();
                setRecents([]);
                if (searchButton.current) focusTvItem(searchButton.current);
              }}
            >
              Clear recent searches
            </TvFocusButton>
          </div>
        </section>
      )}

      {query && (
        <section ref={resultsArea} aria-label="Search results" aria-busy={status === "loading"}>
          {status === "loading" && (
            <div role="status" className="flex min-h-20 items-center gap-3 text-lg text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              Searching for “{query}”…
            </div>
          )}
          {status === "error" && (
            <div data-tv-row="" data-tv-content-row="" className="flex items-center gap-4">
              <p role="status" className="text-lg text-muted-foreground">Couldn’t load search results.</p>
              <TvFocusButton className="min-h-12 bg-card px-4" onClick={() => {
                focusAfterSearch.current = { resultId: null };
                if (searchButton.current) focusTvItem(searchButton.current);
                retry();
              }}>
                Try again
              </TvFocusButton>
            </div>
          )}
          {results?.length === 0 && (
            <TvEmptyState>No titles found for “{query}”. Try a shorter title.</TvEmptyState>
          )}
          {results && results.length > 0 && (
            <>
              <h2 className="mb-4 break-words text-lg font-semibold">Results for “{query}”</h2>
              <TvGrid>
                {results.map((item, index) => (
                  <TvPoster
                    key={item.id}
                    item={item}
                    onOpen={rememberTvSearchResult}
                    layout="grid"
                    priority={index < 6}
                  />
                ))}
              </TvGrid>
            </>
          )}
        </section>
      )}
    </TvPageShell>
  );
}
