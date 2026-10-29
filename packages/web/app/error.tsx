"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { stripBasePath } from "@/lib/base-path";
import { routes } from "@/lib/routes";
import {
  markRouteErrorRetried,
  routeErrorAction,
  routeErrorKey,
  wasRouteErrorRetried,
} from "@/lib/route-error-recovery";
import {
  isStaleChunkMessage,
  reloadForFreshAssets,
} from "@/lib/stale-chunk-recovery";

const reloadsStarted = new Set<string>();

function currentRoute(): { pathname: string; key: string } {
  const pathname = stripBasePath(window.location.pathname);
  return {
    pathname,
    key: routeErrorKey(pathname, window.location.search),
  };
}

export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [giveUp, setGiveUp] = useState(false);

  useEffect(() => {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (isStaleChunkMessage(message) && reloadForFreshAssets(message)) return;

    const { pathname, key } = currentRoute();
    if (reloadsStarted.has(key)) return;

    let retriedRecently = true;
    try {
      retriedRecently = wasRouteErrorRetried(sessionStorage, key, Date.now());
    } catch {
      retriedRecently = true;
    }

    if (routeErrorAction(pathname, retriedRecently) === "reload") {
      try {
        markRouteErrorRetried(sessionStorage, key, Date.now());
      } catch {
        setGiveUp(true);
        return;
      }
      reloadsStarted.add(key);
      window.location.reload();
      return;
    }

    setGiveUp(true);
  }, [error]);

  if (!giveUp) {
    return (
      <div
        className="min-h-[80vh] bg-background"
        role="status"
        aria-label="Loading"
      />
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Error
      </p>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page failed to load. You can try again or return home.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => {
            try {
              const { key } = currentRoute();
              markRouteErrorRetried(sessionStorage, key, Date.now());
            } catch {
              // Reload anyway; the next paint will show this screen if it fails again.
            }
            window.location.reload();
          }}
        >
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href={routes.home()}>Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
