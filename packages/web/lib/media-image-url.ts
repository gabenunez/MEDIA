import { publicUrl } from "./gateway";

export function mediaImageUrl(
  path?: string | null,
  options?: { hd?: boolean },
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const url = publicUrl(path);
  if (options?.hd) {
    return `${url}${url.includes("?") ? "&" : "?"}hd=1`;
  }
  return url;
}
