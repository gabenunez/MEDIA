#!/usr/bin/env node
/**
 * Bump patch version and prepend a CHANGELOG section for automated releases.
 *
 * Environment:
 *   PR_TITLE  — merged pull request title (optional)
 *   PR_BODY   — merged pull request body (optional, first non-empty line used)
 *
 * GitHub Actions: appends `version` and `tag` to GITHUB_OUTPUT when set.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PACKAGE_JSON_PATHS = [
  "package.json",
  "packages/web/package.json",
  "packages/server/package.json",
  "packages/shared/package.json",
];

const RELEASE_COMMIT_RE = /^Release v\d+\.\d+\.\d+/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpPatch(version) {
  const parts = version.split(".").map((part) => parseInt(part, 10) || 0);
  if (parts.length < 3) {
    throw new Error(`Expected semver X.Y.Z, got ${version}`);
  }
  parts[2] += 1;
  return parts.join(".");
}

function latestVersionTag() {
  try {
    const output = execSync("git tag -l 'v*' --sort=-version:refname", {
      encoding: "utf8",
    }).trim();
    const tags = output.split("\n").filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
    return tags[0] ?? null;
  } catch {
    return null;
  }
}

function commitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  try {
    const output = execSync(`git log ${range} --pretty=format:%s --no-merges`, {
      encoding: "utf8",
    }).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !RELEASE_COMMIT_RE.test(line));
  } catch {
    return [];
  }
}

function firstBodyLine(body) {
  if (!body?.trim()) return "";
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("<!--")) continue;
    return trimmed;
  }
  return "";
}

function formatBullet(commit) {
  return `- ${commit}`;
}

function buildChangelogBody({ prTitle, prBodyLine, commits }) {
  const bullets = [];
  const seen = new Set();

  const add = (line) => {
    const normalized = line.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    bullets.push(formatBullet(normalized));
  };

  if (prTitle) {
    add(`**Release** — ${prTitle}`);
  }
  if (prBodyLine && prBodyLine !== prTitle) {
    add(prBodyLine);
  }

  for (const commit of commits) {
    if (commit === prTitle || commit === prBodyLine) continue;
    add(commit);
  }

  if (bullets.length === 0) {
    bullets.push("- **Release** — maintenance update");
  }

  return bullets.join("\n");
}

function prependChangelog(version, body) {
  const today = new Date().toISOString().slice(0, 10);
  const section = `## ${version} — ${today}\n\n### Changes\n\n${body}\n\n`;
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const markdown = fs.readFileSync(changelogPath, "utf8");
  const marker = "# Changelog";
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error("CHANGELOG.md is missing '# Changelog' header");
  }

  const afterHeader = markdown.indexOf("\n", markerIndex);
  const insertAt = afterHeader === -1 ? markdown.length : afterHeader + 1;
  const updated = `${markdown.slice(0, insertAt)}\n${section}${markdown.slice(insertAt).replace(/^\n+/, "")}`;
  fs.writeFileSync(changelogPath, updated);
}

function setVersion(version) {
  for (const relativePath of PACKAGE_JSON_PATHS) {
    const filePath = path.join(process.cwd(), relativePath);
    const pkg = readJson(filePath);
    pkg.version = version;
    writeJson(filePath, pkg);
  }
}

function writeGithubOutput(version) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `version=${version}\n`);
  fs.appendFileSync(outputPath, `tag=v${version}\n`);
}

const prTitle = process.env.PR_TITLE?.trim() ?? "";
const prBodyLine = firstBodyLine(process.env.PR_BODY ?? "");
const currentVersion = readJson(path.join(process.cwd(), "package.json")).version;
const nextVersion = bumpPatch(currentVersion);
const tag = latestVersionTag();
const commits = commitsSinceTag(tag);

prependChangelog(
  nextVersion,
  buildChangelogBody({ prTitle, prBodyLine, commits }),
);
setVersion(nextVersion);

execSync(`node scripts/extract-changelog.mjs v${nextVersion}`, { stdio: "inherit" });

writeGithubOutput(nextVersion);
console.log(`Prepared release ${currentVersion} -> ${nextVersion} (since ${tag ?? "root"})`);
