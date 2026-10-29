import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { walkMediaTree } from "./library-walk.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("walkMediaTree", () => {
  it("visits each episode once when a series folder links back to itself", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-walk-"));
    roots.push(root);
    const show = path.join(root, "Show Name");
    fs.mkdirSync(show);
    fs.writeFileSync(path.join(show, "Show.Name.S01E01.mkv"), "");
    fs.symlinkSync(show, path.join(show, "loop"), "dir");

    const found: string[] = [];
    walkMediaTree(
      root,
      (fullPath) => found.push(fullPath),
      (name) => name.startsWith("."),
    );

    expect(found).toEqual([path.join(show, "Show.Name.S01E01.mkv")]);
  });
});