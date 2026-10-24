import type { Metadata } from "next";
import { HomeClient } from "./home-client";
import { pageMetadataTitle } from "@/lib/document-title";

export const metadata: Metadata = {
  title: pageMetadataTitle("Home"),
};

export default function HomePage() {
  // Paint immediately. Home data loads in the client so a cold server cache
  // cannot hold the navigation open.
  return <HomeClient initialData={null} />;
}
