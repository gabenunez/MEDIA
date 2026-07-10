import type { Metadata } from "next";
import { APP_NAME } from "@media-app/shared";

export { APP_NAME };

export function formatDocumentTitle(pageTitle?: string | null): string {
  if (!pageTitle?.trim()) return APP_NAME;
  return `${pageTitle.trim()} · ${APP_NAME}`;
}

/**
 * Absolute page titles for Next metadata.
 * Root `app/page.tsx` does not reliably pick up the layout title template on
 * hard load / prerender, so always bake in APP_NAME here.
 */
export function pageMetadataTitle(pageTitle?: string | null): NonNullable<Metadata["title"]> {
  return { absolute: formatDocumentTitle(pageTitle) };
}
