import { Suspense } from "react";
import { TvFavoritesClient } from "./client";

export default function TvFavoritesPage() {
  return (
    <Suspense fallback={null}>
      <TvFavoritesClient />
    </Suspense>
  );
}
