#!/usr/bin/env python3
"""Replace regular video files in MEDIA! media libraries with symlinks to duplicates."""

from __future__ import annotations

import argparse
import os
import re
import stat
import sys
from collections import defaultdict

VIDEO_EXT = {".mkv", ".mp4", ".avi", ".m4v", ".wmv", ".mov", ".ts", ".m2ts"}


def norm_name(name: str) -> str:
    base = os.path.splitext(os.path.basename(name))[0].lower()
    return re.sub(r"[^a-z0-9]+", "", base)


def iter_videos(root: str):
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in VIDEO_EXT:
                yield os.path.join(dirpath, fn)


def score_candidate(media_path: str, candidate: str, torrents_root: str) -> int:
    score = 0
    if candidate.startswith(torrents_root + os.sep):
        score += 100
    if os.path.getsize(media_path) == os.path.getsize(candidate):
        score += 50
    mn, cn = norm_name(media_path), norm_name(candidate)
    if mn == cn:
        score += 40
    elif mn in cn or cn in mn:
        score += 20
    return score


def pick_duplicate(
    media_path: str,
    index_by_size: dict[int, list[str]],
    index_by_norm: dict[str, list[tuple[int, str]]],
    torrents_root: str,
) -> str | None:
    size = os.path.getsize(media_path)
    media_abs = os.path.abspath(media_path)
    candidates = [
        p for p in index_by_size.get(size, []) if os.path.abspath(p) != media_abs
    ]
    if not candidates:
        nn = norm_name(media_path)
        for _, path in index_by_norm.get(nn, []):
            if os.path.abspath(path) != media_abs:
                candidates.append(path)
    if not candidates:
        return None
    candidates.sort(
        key=lambda c: score_candidate(media_path, c, torrents_root),
        reverse=True,
    )
    return candidates[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", default=os.path.expanduser("~"))
    parser.add_argument("--apply", action="store_true", help="Apply changes")
    args = parser.parse_args()

    home = os.path.abspath(args.home)
    media_libs = [
        os.path.join(home, "media", "Movies"),
        os.path.join(home, "media", "TV Shows"),
        os.path.join(home, "media", "nugs"),
    ]
    search_roots = [
        os.path.join(home, "torrents", "data"),
        os.path.join(home, "media", "extracted"),
    ]
    torrents_root = os.path.join(home, "torrents", "data")

    index_by_size: dict[int, list[str]] = defaultdict(list)
    index_by_norm: dict[str, list[tuple[int, str]]] = defaultdict(list)
    lib_regular: list[str] = []

    for lib in media_libs:
        if not os.path.isdir(lib):
            continue
        for path in iter_videos(lib):
            try:
                st = os.lstat(path)
            except OSError:
                continue
            if stat.S_ISREG(st.st_mode):
                lib_regular.append(path)

    for root in search_roots:
        if not os.path.isdir(root):
            continue
        for path in iter_videos(root):
            try:
                st = os.lstat(path)
            except OSError:
                continue
            if not stat.S_ISREG(st.st_mode):
                continue
            size = st.st_size
            index_by_size[size].append(path)
            index_by_norm[norm_name(path)].append((size, path))

    converted = 0
    skipped = 0
    freed = 0

    for media_path in sorted(lib_regular):
        duplicate = pick_duplicate(
            media_path, index_by_size, index_by_norm, torrents_root
        )
        if not duplicate:
            skipped += 1
            print(f"SKIP (no duplicate): {media_path}")
            continue

        link_dir = os.path.dirname(media_path)
        rel_target = os.path.relpath(duplicate, link_dir)
        size = os.path.getsize(media_path)

        print(f"CONVERT: {media_path}")
        print(f"  -> {duplicate}")
        print(f"  rel: {rel_target}")

        if args.apply:
            os.remove(media_path)
            os.symlink(rel_target, media_path)
            freed += size
            converted += 1
        else:
            converted += 1

    mode = "APPLIED" if args.apply else "DRY RUN"
    print(
        f"\n{mode}: {converted} converted, {skipped} skipped, "
        f"freed ~{freed / (1024**3):.2f} GB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
