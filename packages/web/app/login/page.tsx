import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageMetadataTitle("Sign in"),
};

/**
 * Data-free login route. Next proxy rewrites unauthenticated catalog
 * requests here so HomePage / fetchHome never run for those clients.
 * AuthProvider still mounts LoginGate; this page must not fetch library data.
 */
export default function LoginPage() {
  return null;
}
