const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function mediaImageUrl(
  path?: string | null,
  options?: { hd?: boolean },
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const url = `${API_BASE}${path}`;
  if (options?.hd) {
    return `${url}${url.includes("?") ? "&" : "?"}hd=1`;
  }
  return url;
}
