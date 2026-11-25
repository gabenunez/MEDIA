const RECENTS_KEY = "media-tv-search-recents-v1";
const RESULT_KEY = "mediaTvSearchResult";
const RECENTS_LIMIT = 5;
export const TV_SEARCH_QUERY_LIMIT = 120;

export function normalizeTvSearchQuery(query: string | null | undefined): string {
  return query?.trim().slice(0, TV_SEARCH_QUERY_LIMIT) ?? "";
}

export function readTvSearchRecents(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((entry): entry is string => typeof entry === "string")
      .map(normalizeTvSearchQuery)
      .filter(Boolean)
      .slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

export function rememberTvSearch(query: string): string[] {
  const recent = readTvSearchRecents();
  const key = query.toLowerCase();
  const next = [query, ...recent.filter((entry) => entry.toLowerCase() !== key)]
    .slice(0, RECENTS_LIMIT);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Search works without storage.
  }
  return next;
}

export function clearTvSearchRecents(): void {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    // Search works without storage.
  }
}

export function setTvSearchQuery(query: string): void {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  // Next reflects native history changes in useSearchParams without fetching
  // the route. Editing this entry also keeps Back from stepping through queries.
  window.history.replaceState(null, "", url);
}

export function rememberTvSearchResult(id: number): void {
  window.history.replaceState({ ...window.history.state, [RESULT_KEY]: id }, "");
}

export function readTvSearchResult(): number | null {
  const id: unknown = window.history.state?.[RESULT_KEY];
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}
