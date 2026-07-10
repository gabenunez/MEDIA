import { describe, expect, it } from "vitest";
import { formatDocumentTitle, pageMetadataTitle } from "./document-title";

describe("formatDocumentTitle", () => {
  it("returns APP_NAME alone when no page title", () => {
    expect(formatDocumentTitle()).toBe("MEDIA!");
    expect(formatDocumentTitle("")).toBe("MEDIA!");
    expect(formatDocumentTitle("   ")).toBe("MEDIA!");
  });

  it("appends MEDIA! for page titles", () => {
    expect(formatDocumentTitle("Home")).toBe("Home · MEDIA!");
    expect(formatDocumentTitle(" Settings ")).toBe("Settings · MEDIA!");
  });
});

describe("pageMetadataTitle", () => {
  it("bakes MEDIA! into an absolute title for hard-load SSR", () => {
    expect(pageMetadataTitle("Home")).toEqual({ absolute: "Home · MEDIA!" });
    expect(pageMetadataTitle(null)).toEqual({ absolute: "MEDIA!" });
  });
});
