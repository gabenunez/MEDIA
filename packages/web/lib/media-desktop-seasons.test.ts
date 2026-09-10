import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("desktop episode list click targets", () => {
  const source = readFileSync(
    path.join(webRoot, "app/media/media-desktop-seasons.tsx"),
    "utf8",
  );

  it("puts still + title inside the watch Link (not under a z-0 overlay)", () => {
    expect(source).not.toMatch(/className="absolute inset-0 z-0"/);
    expect(source).toContain(
      'className="relative flex min-w-0 flex-1 items-center gap-4"',
    );
    const watchHref = 'href={routes.watch("episode", ep.id, media.id)}';
    const watchAt = source.indexOf(watchHref);
    const stillAt = source.indexOf("ep.stillPath");
    const titleAt = source.indexOf("{ep.title}");
    expect(watchAt).toBeGreaterThan(-1);
    expect(stillAt).toBeGreaterThan(watchAt);
    expect(titleAt).toBeGreaterThan(watchAt);
  });

  it("keeps Start from beginning as a sibling control after the watch Link", () => {
    const watchAt = source.indexOf('routes.watch("episode", ep.id, media.id)');
    const fromStartAt = source.indexOf(
      'routes.watchFromStart("episode", ep.id, media.id)',
    );
    expect(watchAt).toBeGreaterThan(-1);
    expect(fromStartAt).toBeGreaterThan(watchAt);
  });
});
