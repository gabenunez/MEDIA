import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { revalidateCatalog, revalidateMediaPage } from "./page-revalidate.js";

describe("page revalidate", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MEDIA_WEB_INTERNAL_URL", "http://127.0.0.1:8096");
    vi.stubEnv("MEDIA_PUBLIC_PREFIX", "/reel");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts movie/TV page busts through the public prefix and home catalog tag", async () => {
    await revalidateMediaPage(42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8096/reel/internal/revalidate/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as {
      tag: string;
      tags: string[];
      paths: string[];
    };
    expect(body.tag).toBe("media:42");
    expect(body.tags).toContain(HOME_CATALOG_CACHE_TAG);
    expect(body.paths).toContain("/");
    expect(body.paths).toContain("/recent/");
  });

  it("can bust the home catalog without a media id", async () => {
    await revalidateCatalog();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8096/reel/internal/revalidate/");
    expect(JSON.parse(String(init.body)).tag).toBe(HOME_CATALOG_CACHE_TAG);
  });
});
