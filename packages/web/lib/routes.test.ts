import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("returns paths without the Next.js base path", () => {
    expect(routes.watch("movie", 116, 110)).toBe("/watch/movie/116/?media=110");
  });
});
