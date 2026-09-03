"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBrowserPathname } from "@/lib/use-browser-pathname";
import type { ReactNode } from "react";
import { Home, Heart, LogOut, Search } from "lucide-react";
import { useAuth } from "@/components/auth-gate";
import { MediaIcon } from "@/components/media-icon";
import { TvSpatialNav } from "@/components/tv/tv-spatial-nav";
import { tvNavItemClassName, TvFocusButton } from "@/components/tv/tv-focus-link";
import {
  nativeTvPlayerAvailable,
  raiseNativeWebOverlay,
  stopNativePlayback,
} from "@/lib/android-bridge";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { closeTvSideNav } from "@/lib/tv-side-nav";
import { installTvRemoteBackBridge } from "@/lib/tv-back";

function TvNavButton({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      data-tv-item=""
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      prefetch={false}
      onFocus={() => router.prefetch(href)}
      {...(active ? { "data-tv-nav-active": "" as const } : {})}
      className={cn(
        "flex h-11 w-11 items-center justify-center",
        tvNavItemClassName,
        !active && "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function TvLogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <TvFocusButton
      variant="nav"
      title="Sign out"
      aria-label="Sign out"
      onClick={onLogout}
      className="flex h-11 w-11 items-center justify-center text-muted-foreground"
    >
      <LogOut className="h-5 w-5" />
    </TvFocusButton>
  );
}

export function TvShell({ children }: { children: React.ReactNode }) {
  const pathname = useBrowserPathname();
  const router = useRouter();
  const wasOnWatchRef = useRef(false);
  const { required, authenticated, logout } = useAuth();
  const onWatch = pathname.startsWith("/watch");
  const homeActive = pathname === "/" || pathname === "";
  const favoritesActive = pathname.startsWith("/favorites");
  const searchActive = pathname.startsWith("/search");
  const showLogout = required && authenticated;

  useEffect(() => {
    closeTvSideNav();
    return installTvRemoteBackBridge();
  }, []);

  useEffect(() => {
    if (homeActive) return;
    router.prefetch(routes.home());
  }, [router, homeActive]);

  useEffect(() => {
    // Set before watch-view mounts so loading.tsx / CSS can cover the rail
    // without waiting for the player client bundle.
    if (onWatch) {
      document.documentElement.setAttribute("data-tv-watch-active", "true");
    } else {
      document.documentElement.removeAttribute("data-tv-watch-active");
    }

    if (wasOnWatchRef.current && !onWatch) {
      if (nativeTvPlayerAvailable()) {
        // Cover the native surface first, then unbind immediately so the last
        // title is not still attached when the next play starts.
        document.documentElement.removeAttribute("data-native-video");
        raiseNativeWebOverlay();
        stopNativePlayback();
      }
      const video = document.querySelector("video");
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    }
    wasOnWatchRef.current = onWatch;
    if (onWatch) closeTvSideNav();
  }, [onWatch]);

  const handleLogout = () => {
    void logout();
  };

  return (
    <TvSpatialNav>
      <div className="tv-ui relative flex h-screen max-h-screen overflow-hidden">
        {/*
          Overlay rail: hidden until Left has nowhere else to go. Keep it mounted
          on /watch so catalog → player does not remount the nav tree.
        */}
        <aside
          data-tv-rail=""
          className={cn(
            "flex w-[4.25rem] flex-col items-center border-r border-border bg-background py-5",
            onWatch && "pointer-events-none",
          )}
          aria-hidden={onWatch || undefined}
        >
            <div
              data-tv-logo=""
              className="mb-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-transparent"
              aria-hidden="true"
            >
              <MediaIcon background={false} combined className="h-11 w-11" />
            </div>

            <nav
              data-tv-row=""
              data-tv-nav-row=""
              data-tv-vertical=""
              className="flex flex-col items-center gap-2"
            >
              <TvNavButton href={routes.home()} label="Home" active={homeActive}>
                <Home className="h-5 w-5" />
              </TvNavButton>
              <TvNavButton
                href={routes.favorites()}
                label="Favorites"
                active={favoritesActive}
              >
                <Heart className="h-5 w-5" />
              </TvNavButton>
              <TvNavButton href={routes.search()} label="Search" active={searchActive}>
                <Search className="h-5 w-5" />
              </TvNavButton>
              {/* Keep mounted so unlock doesn't reshuffle nav focus targets. */}
              {required ? (
                <div
                  className={showLogout ? undefined : "hidden"}
                  aria-hidden={showLogout ? undefined : true}
                >
                  <TvLogoutButton onLogout={handleLogout} />
                </div>
              ) : null}
            </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </TvSpatialNav>
  );
}
