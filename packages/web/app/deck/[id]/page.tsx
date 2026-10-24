import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife } from "@/lib/catalog-cache";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { LibraryClient } from "../../library/client";
import { fetchDeck, fetchDeckItems } from "@/lib/server-api";
import { DynamicMarker } from "@/lib/dynamic-marker";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Deck"),
};

export default function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <DeckDetailContent params={params} />
      </Suspense>
    </>
  );
}

async function DeckDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deckId = parseInt(id, 10);
  if (!Number.isFinite(deckId)) return <LibraryClient />;

  try {
    return await CachedDeck({ deckId });
  } catch {
    return <LibraryClient />;
  }
}

async function CachedDeck({ deckId }: { deckId: number }) {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const [{ data: deck }, { data: items }] = await Promise.all([
    fetchDeck(deckId),
    fetchDeckItems(deckId, 1),
  ]);
  if (!items) throw new Error("deck unavailable");

  const deckRecord = deck as {
    name?: string;
    paths?: string[];
    libraryNames?: string[];
  } | null;

  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <LibraryClient
        initialList={{
          kind: "deck",
          id: deckId,
          page: items,
          title: deckRecord?.name ?? "Deck",
          subtitle: deckRecord
            ? `${deckRecord.paths?.length ?? 0} folder${
                (deckRecord.paths?.length ?? 0) === 1 ? "" : "s"
              } / ${deckRecord.libraryNames?.join(", ") || "Custom deck"}`
            : "Custom deck",
        }}
      />
    </Suspense>
  );
}
