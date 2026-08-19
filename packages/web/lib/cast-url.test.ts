import { describe, expect, it } from "vitest";
import { rewriteCastMediaUrls, rewriteCastUrlToPageOrigin, safeCastLocation, toChromecastMediaUrl } from "./cast-url";

const page = "https://media.example.com";

describe("rewriteCastUrlToPageOrigin", () => {
  it("upgrades HTTP reverse-proxy URLs to the HTTPS page origin", () => {
    expect(
      rewriteCastUrlToPageOrigin(
        "http://media.example.com/reel/api/stream/12?type=movie&castToken=abc",
        page,
      ),
    ).toBe(
      "https://media.example.com/reel/api/stream/12?type=movie&castToken=abc",
    );
  });

  it("replaces a seedbox LAN IP with the public host the sender is using", () => {
    expect(
      rewriteCastUrlToPageOrigin(
        "http://10.0.0.8:8096/reel/api/stream/12?type=movie&castToken=abc",
        page,
      ),
    ).toBe(
      "https://media.example.com/reel/api/stream/12?type=movie&castToken=abc",
    );
  });

  it("rewrites the HLS base query so segments stay on the public HTTPS origin", () => {
    const url = rewriteCastUrlToPageOrigin(
      "http://10.0.0.8:8096/reel/api/stream/12/hls/master.m3u8?cast=1&base=http%3A%2F%2F10.0.0.8%3A8096%2Freel&castToken=abc",
      page,
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe(page);
    expect(parsed.searchParams.get("base")).toBe("https://media.example.com/reel");
  });

  it("does not rewrite localhost senders (LAN URLs must stay reachable)", () => {
    const lan =
      "http://192.168.1.20:8096/reel/api/stream/12?type=movie&castToken=abc";
    expect(rewriteCastUrlToPageOrigin(lan, "http://localhost:8096")).toBe(lan);
  });

  it("adds the public prefix when Fastify omitted it (Apache only proxies /reel)", () => {
    expect(
      rewriteCastUrlToPageOrigin(
        "http://127.0.0.1:8097/api/stream/12?type=movie&castToken=abc",
        page,
        "/reel",
      ),
    ).toBe(
      "https://media.example.com/reel/api/stream/12?type=movie&castToken=abc",
    );
  });
});

describe("rewriteCastMediaUrls", () => {
  it("rewrites content, poster, and subtitle URLs together", () => {
    const rewritten = rewriteCastMediaUrls(
      {
        contentUrl: "http://10.0.0.8:8096/reel/api/stream/1?castToken=a",
        posterUrl: "http://10.0.0.8:8096/reel/api/images/poster.jpg",
        subtitleUrl: "http://10.0.0.8:8096/reel/api/subtitles/4?castToken=a",
      },
      page,
    );
    expect(rewritten.contentUrl.startsWith("https://media.example.com/reel/")).toBe(
      true,
    );
    expect(rewritten.posterUrl).toBe(
      "https://media.example.com/reel/api/images/poster.jpg",
    );
    expect(rewritten.subtitleUrl).toBe(
      "https://media.example.com/reel/api/subtitles/4?castToken=a",
    );
  });
});

describe("safeCastLocation", () => {
  it("strips the query so errors never include a cast token", () => {
    expect(
      safeCastLocation(
        "https://media.example.com/reel/api/stream/12?type=movie&castToken=secret",
      ),
    ).toBe("https://media.example.com/reel/api/stream/12");
  });
});

describe("toChromecastMediaUrl", () => {
  it("uses HTTP on port 80 so Chromecast does not have to verify Generation Y TLS", () => {
    expect(
      toChromecastMediaUrl(
        "https://media.example.com/reel/api/stream/12?type=movie&castToken=abc",
      ),
    ).toBe(
      "http://media.example.com/reel/api/stream/12?type=movie&castToken=abc",
    );
  });

  it("rewrites the HLS base query to HTTP as well", () => {
    const url = toChromecastMediaUrl(
      "https://media.example.com/reel/api/stream/12/hls/master.m3u8?cast=1&base=https%3A%2F%2Fmedia.example.com%2Freel&castToken=abc",
    );
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("http:");
    expect(parsed.searchParams.get("base")).toBe("http://media.example.com/reel");
  });

  it("leaves localhost URLs unchanged", () => {
    const lan = "http://192.168.1.20:8096/reel/api/stream/12?castToken=abc";
    expect(toChromecastMediaUrl(lan)).toBe(lan);
  });
});
