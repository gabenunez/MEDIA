# Reel — Self-Hosted Media Server

A beautiful, self-hosted Plex alternative for streaming your personal movie and TV libraries.

**Repository:** [github.com/gabenunez/reel](https://github.com/gabenunez/reel)

## Features

- **Library scanning** — Automatically indexes movies and TV shows from configured folders
- **Rich metadata** — Posters, backdrops, descriptions, and cast via TMDB
- **Smart parsing** — Detects `S01E02`, season folders, and movie filenames
- **Streaming** — Direct play with byte-range requests or HLS transcoding via FFmpeg
- **Subtitles** — External `.srt`/`.vtt` files and embedded track extraction
- **Chromecast** — Cast any video to your TV from Chrome
- **Beautiful UI** — Dark cinematic web interface with continue watching, search, and more
- **Native deployment** — Single Node process, SQLite database, simple config file

## Quick Start

### VPS (one command)

On a fresh Linux server (Ubuntu/Debian recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/gabenunez/reel/main/install.sh | bash
```

The guided installer will set up Node, FFmpeg, build Reel, and start a systemd service at `/opt/reel`.

Then open `http://YOUR_SERVER_IP:8096/settings` and add your media folders.

**Scripts:** [install.sh](https://github.com/gabenunez/reel/blob/main/install.sh) · [scripts/install-vps.sh](https://github.com/gabenunez/reel/blob/main/scripts/install-vps.sh)

### Local development

```bash
git clone https://github.com/gabenunez/reel.git
cd reel
pnpm install
pnpm build
pnpm start
```

Open http://localhost:8096/settings

Or use the dev script with hot reload:

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

### Update

On a VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/gabenunez/reel/main/update.sh | bash
```

From a local clone:

```bash
./update.sh
# or
pnpm update
```

**Script:** [update.sh](https://github.com/gabenunez/reel/blob/main/update.sh)

### First-time setup

1. Add your movie/TV folders in **Settings**
2. Paste your [TMDB API key](https://www.themoviedb.org/settings/api) (free, recommended for posters and metadata)
3. Click **Scan** on each library, then browse your collection

## Prerequisites

- **Node.js** 20+ and **pnpm** (local dev)
- **FFmpeg** (includes ffprobe)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Configuration

Everything is managed in the web UI at **Settings** (`/settings`):

- Add, edit, and remove media library folders with a built-in folder browser
- Set your TMDB API key for posters and metadata
- Trigger library scans or refresh metadata

On first launch, Reel auto-creates a `config.yaml` if needed. You shouldn't need to edit it manually.

See [config.example.yaml](https://github.com/gabenunez/reel/blob/main/config.example.yaml) for the full schema.

## Auto-Start

### macOS (launchd)

```bash
# Edit deploy/com.reel.server.plist — set WorkingDirectory
cp deploy/com.reel.server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.reel.server.plist
```

### Linux (systemd)

Installed automatically by the VPS installer. Manual setup:

```bash
sudo cp deploy/reel.service /etc/systemd/system/
sudo systemctl enable reel
sudo systemctl start reel
```

See [deploy/reel.service](https://github.com/gabenunez/reel/blob/main/deploy/reel.service).

## Project Structure

```
reel/
├── install.sh              # One-line VPS installer entry point
├── update.sh               # One-line updater entry point
├── config.example.yaml     # Configuration template
├── packages/
│   ├── shared/             # Shared types and filename parsers
│   ├── server/             # Fastify API, scanner, streaming
│   └── web/                # Next.js static web UI
├── scripts/                # Install, update, and dev scripts
└── deploy/                 # launchd and systemd units
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Server health and scan progress |
| `GET /api/libraries` | List libraries |
| `GET /api/libraries/:id/items` | Paginated media grid |
| `GET /api/media/:id` | Media detail with episodes |
| `GET /api/search?q=` | Search library |
| `GET /api/stream/:fileId` | Direct video stream |
| `GET /api/stream/:fileId/hls/master.m3u8` | HLS transcoded stream |
| `GET /api/subtitles/:id` | Subtitle track (WebVTT) |
| `POST /api/libraries/:id/scan` | Trigger library rescan |
| `POST /api/metadata/refresh` | Re-fetch TMDB metadata |

## Supported Video Formats

Reel indexes files by extension **and** falls back to FFprobe for unknown types (≥512 KB).

**Containers:** MKV, MP4, M4V, MOV, AVI, WebM, WMV, FLV, F4V, TS, M2TS, MTS, MPG, MPEG, DIVX, XVID, 3GP, OGV, VOB, ASF, RM, RMVB, MXF, ISO, and more.

**Playback:** Direct play for browser-friendly formats; use **Transcode** in the player for everything else (FFmpeg → H.264/AAC HLS).

**Subtitles:** SRT, VTT, ASS, SSA, SUB, IDX, SMI (external sidecars + embedded tracks).

## TV Show Folder Structure

Reel expects standard naming conventions:

```
TV Shows/
  Breaking Bad/
    Season 01/
      Breaking Bad S01E01.mkv
      Breaking Bad S01E02.mkv
```

Supported episode patterns: `S01E02`, `1x02`, `Season 1 Episode 2`

## License

MIT
