import { Suspense } from "react";
import { connection } from "next/server";

async function Connection() {
  await connection();
  return null;
}

/** Tells Cache Components this route's metadata is intentionally request-time. */
export function DynamicMarker() {
  return (
    <Suspense fallback={null}>
      <Connection />
    </Suspense>
  );
}
