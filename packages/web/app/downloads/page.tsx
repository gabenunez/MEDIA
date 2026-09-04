import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { DownloadsClient } from "./client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Downloads"),
};

export default function DownloadsPage() {
  return <DownloadsClient />;
}
