#!/usr/bin/env bash
#
# Download real, freely-licensed videos (public domain + Creative Commons) so
# you can populate MEDIA! with genuine posters/metadata for screenshots and
# public demos. Nothing here is copyrighted commercial content.
#
# Sources: archive.org (public domain) and the Blender open movies (CC-BY).
# Files are resolved live via the archive.org metadata API so the script keeps
# working even when a mirror renames its files.
#
# Usage:
#   ./scripts/download-demo-media.sh
#   MEDIA_DEMO_MOVIES=/path/to/movies MEDIA_DEMO_TV=/path/to/tv ./scripts/download-demo-media.sh
#
set -euo pipefail

MOVIES="${MEDIA_DEMO_MOVIES:-${REEL_TEST_MOVIES:-/tmp/reel-movies}}"
TV="${MEDIA_DEMO_TV:-${REEL_TEST_TV:-/tmp/reel-tv}}"
TV_SHOW_DIR="$TV/Blender Open Movies"

for tool in curl node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Error: '$tool' is required." >&2; exit 1; }
done

mkdir -p "$MOVIES" "$TV_SHOW_DIR/Season 01"

# Resolve the smallest reasonable .mp4 for an archive.org item and print its
# absolute download URL. Returns non-zero if the item or an mp4 is missing.
resolve_archive_mp4_url() {
  local identifier="$1"
  curl -s -m 30 "https://archive.org/metadata/${identifier}" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      try {
        const meta = JSON.parse(raw);
        if (!meta.metadata || !Array.isArray(meta.files)) process.exit(2);
        const mp4s = meta.files
          .filter((f) => /\.mp4$/i.test(f.name || ""))
          .map((f) => ({ name: f.name, size: Number(f.size) || 0 }))
          // Prefer a watchable-but-small file (skip tiny thumbnails/samples).
          .filter((f) => f.size === 0 || f.size > 5_000_000)
          .sort((a, b) => a.size - b.size);
        if (mp4s.length === 0) process.exit(3);
        const host = meta.server || "archive.org";
        const dir = meta.dir || `/download/${process.argv[1]}`;
        const name = mp4s[0].name.split("/").map(encodeURIComponent).join("/");
        console.log(`https://${host}${dir}/${name}`);
      } catch {
        process.exit(4);
      }
    });
  ' "$identifier"
}

download_item() {
  local identifier="$1" dest="$2"
  if [[ -f "$dest" ]]; then
    echo "  ✓ exists: $(basename "$dest")"
    return 0
  fi

  local url
  if ! url="$(resolve_archive_mp4_url "$identifier")" || [[ -z "$url" ]]; then
    echo "  ✗ skip: could not resolve $identifier" >&2
    return 0
  fi

  echo "  ↓ $(basename "$dest")"
  if curl -fL --retry 3 --retry-delay 2 -m 1800 -o "$dest.part" "$url"; then
    mv "$dest.part" "$dest"
  else
    rm -f "$dest.part"
    echo "  ✗ failed: $identifier" >&2
  fi
}

write_srt() {
  local path="$1" line="$2"
  cat > "$path" <<EOF
1
00:00:02,000 --> 00:00:09,000
$line

2
00:00:11,000 --> 00:00:16,000
Freely-licensed demo content — MEDIA!
EOF
}

echo "Downloading demo movies into $MOVIES ..."
# identifier|Clean Title (Year).mp4
MOVIES_LIST=(
  "BigBuckBunny_124|Big Buck Bunny (2008).mp4"
  "Sintel|Sintel (2010).mp4"
  "TheGeneral1926|The General (1926).mp4"
  "CosmosLaundromatFirstCycle|Cosmos Laundromat (2015).mp4"
  "PrivateEyePopeye|Private Eye Popeye (1954).mp4"
)
for entry in "${MOVIES_LIST[@]}"; do
  id="${entry%%|*}"
  name="${entry#*|}"
  download_item "$id" "$MOVIES/$name"
done

write_srt "$MOVIES/Big Buck Bunny (2008).en.srt" "Big Buck Bunny — direct play check"
write_srt "$MOVIES/Sintel (2010).en.srt" "Sintel — MKV/MP4 subtitle check"

echo ""
echo "Downloading demo TV episodes into $TV_SHOW_DIR ..."
# identifier|SxxExx label
TV_LIST=(
  "ElephantsDream|S01E01 - Elephants Dream"
  "BigBuckBunny_124|S01E02 - Big Buck Bunny"
  "Sintel|S01E03 - Sintel"
  "tears-of-steel_202601|S01E04 - Tears of Steel"
)
epnum=1
for entry in "${TV_LIST[@]}"; do
  id="${entry%%|*}"
  label="${entry#*|}"
  download_item "$id" "$TV_SHOW_DIR/Season 01/Blender Open Movies $label.mp4"
  epnum=$((epnum + 1))
done

write_srt "$TV_SHOW_DIR/Season 01/Blender Open Movies S01E01 - Elephants Dream.en.srt" \
  "Blender Open Movies S01E01"

echo ""
echo "Demo media ready:"
find "$MOVIES" "$TV" -type f \( -name '*.mp4' -o -name '*.mkv' -o -name '*.srt' \) | sort

cat <<'NOTE'

All titles are public domain or Creative Commons (Blender open movies are CC-BY).
Trigger a scan from Settings → Libraries, or:
  curl -X POST http://localhost:8096/api/libraries/1/scan
  curl -X POST http://localhost:8096/api/libraries/2/scan
NOTE
