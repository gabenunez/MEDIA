---
name: version
description: >-
  Cut a semver release for MEDIA!/Reel: bump package versions, write CHANGELOG,
  commit, tag, push, and publish GitHub release. Use when the user says /version,
  cut the version, release, bump version, tag and push, or publish a new version.
disable-model-invocation: true
---

# Version

Cut a patch release (`0.1.x`) using the repo's release script. Follow this workflow end-to-end unless the user asks for only part of it (e.g. bump only, no push).

## Preconditions

- User request counts as permission to **commit, tag, and push**.
- Do **not** launch the TV app or deploy to production unless the user also asks.
- Do **not** include unrelated untracked files (e.g. `.cursor/`) in the release commit unless asked.

## Workflow

### 1. Inspect repo state

Run in parallel:

```bash
git status
git log -10 --oneline
git tag -l 'v0.1.*' | tail -5
node -e "console.log(require('./package.json').version)"
```

Note commits on `main` since the latest `v0.1.*` tag that are not already release commits.

### 2. Choose next version

- Read current version from root `package.json` (e.g. `0.1.64`).
- Default: **patch bump** → `0.1.65`.
- Use an explicit version only if the user specifies one (must match `vX.Y.Z`).

### 3. Write CHANGELOG

Add a new section at the **top** of `CHANGELOG.md` (after `# Changelog`):

```markdown
## 0.1.65 — YYYY-MM-DD

### Fix
- **Area** — user-facing one-liner

### TV
- **Feature** — description
```

Rules:

- Header format: `## X.Y.Z — YYYY-MM-DD` (em dash). `scripts/extract-changelog.mjs` requires this.
- Group under headings used elsewhere: `Fix`, `TV`, `Playback`, `UI`, `Performance`, `Tooling`, `Settings`, `Dependencies`.
- Summarize **all commits since the last tag**, not only the latest commit.
- Focus on user-visible changes; skip version-only noise.

Validate before committing:

```bash
node scripts/extract-changelog.mjs v0.1.65
```

### 4. Bump version in all package.json files

Update `"version"` in **all four** files to the same value:

- `package.json`
- `packages/web/package.json`
- `packages/server/package.json`
- `packages/shared/package.json`

### 5. Release commit

Stage only release files (`CHANGELOG.md` + the four `package.json` files).

Commit message pattern (match recent releases):

```
Release v0.1.65: short summary of main themes.

One sentence expanding the headline changes.
```

Use a HEREDOC for the commit message.

### 6. Tag, push, and publish

```bash
bash scripts/release.sh v0.1.65
```

This script:

1. Validates the CHANGELOG section exists
2. Creates annotated tag `v0.1.65`
3. Pushes `main` and the tag to `origin`
4. Creates/updates the GitHub release with changelog notes

Requires `gh` authenticated (`gh auth status`).

Alternative if versions already match tag intent: `pnpm release` (runs the same script from root `package.json`).

### 7. Report back

Return:

- New version and tag
- GitHub release URL
- Brief bullet summary of what shipped
- Deploy hint (do **not** run unless asked):

```bash
MEDIA_NONINTERACTIVE=1 MEDIA_RELEASE_TAG=v0.1.65 bash scripts/update.sh
```

## Partial requests

| User asks | Do |
|-----------|-----|
| "bump version only" | Steps 3–4, commit; skip tag/push unless asked |
| "cut version and push" | Full workflow (default) |
| "what's the next version?" | Inspect only; no commits |
| Explicit `v0.1.60` | Use that tag; error if tag already exists |

## Failure handling

- **No changelog section** → add/fix `CHANGELOG.md`, re-run extract script
- **Tag already exists** → do not force-push; tell user and ask how to proceed
- **Uncommitted feature work** → include in changelog if shipping now; otherwise warn before releasing
- **Pre-commit hook modifies files** → fix and create a **new** commit (never amend unless hook-only and HEAD is yours)

## Do not

- Force-push tags or `main`
- Skip any of the four `package.json` bumps
- Launch TV via ADB as part of release verification
- Deploy to production without explicit request
- Store or echo credentials, tokens, or private infrastructure details in rules, skills, or commits
