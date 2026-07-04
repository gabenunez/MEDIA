#!/usr/bin/env node
/**
 * Extract a version section from CHANGELOG.md for GitHub Releases.
 * Usage: node scripts/extract-changelog.mjs v0.1.44
 */

import fs from "fs";
import path from "path";

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/extract-changelog.mjs <tag>");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const changelogPath = path.join(process.cwd(), "CHANGELOG.md");

if (!fs.existsSync(changelogPath)) {
  console.error(`CHANGELOG.md not found at ${changelogPath}`);
  process.exit(1);
}

const markdown = fs.readFileSync(changelogPath, "utf8");
const escaped = version.replace(/\./g, "\\.");
const header = new RegExp(`^##\\s+${escaped}\\s*(?:—|-).*?$`, "m");
const match = markdown.match(header);

if (!match || match.index === undefined) {
  console.error(`No changelog section found for ${version}`);
  process.exit(1);
}

const start = match.index + match[0].length;
const rest = markdown.slice(start);
const nextHeader = rest.search(/^##\s+\d+\.\d+\.\d+/m);
const section = (nextHeader === -1 ? rest : rest.slice(0, nextHeader)).trim();

if (!section) {
  console.error(`Empty changelog section for ${version}`);
  process.exit(1);
}

process.stdout.write(`${section}\n`);
