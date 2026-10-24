import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("media page build", () => {
  it("does not pre-render every title", () => {
    const page = readFileSync(path.join(webRoot, "app/media/[id]/page.tsx"), "utf8");
    expect(page).not.toContain("generateStaticParams");
    expect(page).not.toContain("fetchMediaIds");
    expect(page).not.toContain("fetchMediaDetail");
    expect(page).toContain("MediaDetailClient");
    const build = readFileSync(path.join(webRoot, "scripts/with-api-for-build.mjs"), "utf8");
    expect(build).not.toContain("/api/media/ids");
    expect(build).toContain("Media pages are not pre-rendered");
  });
});
