import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { WatchPageClient } from "./page-client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Watch"),
};

export default function WatchPage() {
  return <WatchPageClient />;
}
