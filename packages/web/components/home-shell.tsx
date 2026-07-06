import Link from "next/link";

/** Prerendered static hero copy — baked into the static export shell. */
export function HomeHeroStatic() {
  return (
    <div className="relative max-w-xl">
      <h1 className="leading-none">
        <span className="mb-3 block font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground sm:text-xs">
          This is your
        </span>
        <span className="home-hero-title relative block text-[3.25rem] font-black tracking-[-0.045em] sm:text-[4.25rem] lg:text-[5.25rem]">
          <span className="home-hero-title-ghost" aria-hidden>
            MEDIA!
          </span>
          <span className="home-hero-title-fill">MEDIA</span>
          <span className="home-hero-title-bang text-accent">!</span>
        </span>
      </h1>

      <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-muted-foreground sm:mt-6 sm:text-base">
        Your movies and TV, streamed from your own drives on your network.
      </p>
    </div>
  );
}

export function HomeHeroWatermark() {
  return (
    <div className="home-hero-watermark pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <span className="home-hero-watermark-text">MEDIA!</span>
      <div className="home-hero-rings">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function HomeHeroMonitorFrame() {
  return (
    <div className="home-hero-monitor-frame pointer-events-none absolute inset-3 sm:inset-4" aria-hidden>
      <span className="home-hero-corner home-hero-corner-tl" />
      <span className="home-hero-corner home-hero-corner-tr" />
      <span className="home-hero-corner home-hero-corner-bl" />
      <span className="home-hero-corner home-hero-corner-br" />
    </div>
  );
}

export function HomeSectionHeading({
  title,
  accent = "primary",
  href,
  linkLabel = "View all",
}: {
  title: string;
  accent?: "primary" | "accent";
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          className={accent === "accent" ? "h-px w-8 bg-accent" : "h-px w-8 bg-primary"}
        />
        <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="text-sm font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
