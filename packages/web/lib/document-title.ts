export const APP_NAME = "Reel";

export function formatDocumentTitle(pageTitle?: string | null): string {
  if (!pageTitle?.trim()) return APP_NAME;
  return `${pageTitle.trim()} · ${APP_NAME}`;
}
