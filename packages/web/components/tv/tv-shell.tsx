"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Home, Search } from "lucide-react";
import { ReelIcon } from "@/components/reel-icon";
import { TvSpatialNav } from "@/components/tv/tv-spatial-nav";
import { tvRoutes } from "@/lib/tv/routes";
import { cn } from "@/lib/utils";

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
  return (
    <Link
      href={href}
      data-tv-item=""
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-xl outline-none transition-all focus-visible:scale-105 focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function TvShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideHeader = pathname.startsWith("/tv/watch");
  const homeActive = pathname === "/tv" || pathname === "/tv/";
  const searchActive = pathname.startsWith("/tv/search");

  return (
    <TvSpatialNav>
      <div className="tv-ui min-h-screen pb-12">
        {!hideHeader && (
          <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
            <div
              data-tv-row=""
              className="mx-auto flex h-20 max-w-[1600px] items-center gap-6 px-8"
            >
              <Link
                href={tvRoutes.home()}
                data-tv-item=""
                className="mr-2 flex shrink-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ReelIcon className="h-11 w-11" />
                <span className="text-2xl font-bold tracking-tight">Reel</span>
              </Link>

              <div className="ml-auto flex items-center gap-3">
                <TvNavButton href={tvRoutes.home()} label="Home" active={homeActive}>
                  <Home className="h-6 w-6" />
                </TvNavButton>
                <TvNavButton
                  href={tvRoutes.search()}
                  label="Search"
                  active={searchActive}
                >
                  <Search className="h-6 w-6" />
                </TvNavButton>
              </div>
            </div>
          </header>
        )}
        <main>{children}</main>
      </div>
    </TvSpatialNav>
  );
}
