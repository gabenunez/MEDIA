import type { Metadata } from "next";
import { HomeClient } from "./home-client";
import { pageMetadataTitle } from "@/lib/document-title";
import { fetchHome } from "@/lib/server-api";

export const revalidate = 60;

export const metadata: Metadata = {
  title: pageMetadataTitle("Home"),
};

export default async function HomePage() {
  const { data: initialData } = await fetchHome();
  return <HomeClient initialData={initialData} />;
}
