import { APP_NAME } from "@media-app/shared";

export { APP_NAME };

export function formatDocumentTitle(pageTitle?: string | null): string {
  if (!pageTitle?.trim()) return APP_NAME;
  return `${pageTitle.trim()} · ${APP_NAME}`;
}
