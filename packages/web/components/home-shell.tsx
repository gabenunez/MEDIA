import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prerendered static hero copy — baked into the static export shell. */
export function HomeHeroStatic() {
  return (
    <div>
      <h1 className="mb-4 text-5xl font-black sm:text-7xl">Reel</h1>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
        A private cinema console for movies, seasons, and instant local playback.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" size="lg" asChild>
          <Link href="/settings">
            <Settings className="h-5 w-5" />
            Console
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function HomeSectionHeading({
  title,
  accent = "primary",
}: {
  title: string;
  accent?: "primary" | "accent";
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-7xl items-center gap-3 px-4 sm:px-6">
      <span
        className={accent === "accent" ? "h-px w-8 bg-accent" : "h-px w-8 bg-primary"}
      />
      <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
    </div>
  );
}
