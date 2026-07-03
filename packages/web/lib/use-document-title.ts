"use client";

import { useEffect } from "react";
import { formatDocumentTitle } from "@/lib/document-title";

export function useDocumentTitle(pageTitle?: string | null) {
  useEffect(() => {
    document.title = formatDocumentTitle(pageTitle);
  }, [pageTitle]);
}
