import { withBasePath } from "./base-path";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function imageApiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return withBasePath(path);
}

export function mediaImageUrl(
  path?: string | null,
  options?: { hd?: boolean },
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const url = imageApiUrl(path);
  if (options?.hd) {
    return `${url}${url.includes("?") ? "&" : "?"}hd=1`;
  }
  return url;
}
