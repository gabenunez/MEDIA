# Reel — Self-Hosted Media Server

A beautiful, self-hosted Plex alternative for streaming your personal movie and TV libraries.

**Repository:** [github.com/gabenunez/reel](https://github.com/gabenunez/reel)

## Features

- **Library scanning** — Automatically indexes movies and TV shows from configured folders
- **Rich metadata** — Posters, backdrops, descriptions, and cast via TMDB
- **Smart parsing** — Detects `S01E02`, season folders, and movie filenames
- **Streaming** — Direct play with byte-range requests or HLS transcoding via FFmpeg
- **Subtitles** — External `.srt`/`.vtt` files, embedded tracks, and online search via OpenSubtitles
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

**In the app:** Open **Settings → Updates**. Reel checks [GitHub Releases](https://github.com/gabenunez/reel/releases) automatically and shows an **Update now** button when a newer version is available, with a link to the release notes.

**From the shell** (VPS or local clone):

```bash
curl -fsSL https://raw.githubusercontent.com/gabenunez/reel/main/update.sh | bash
```

```bash
./update.sh
# or
pnpm update
```

**Script:** [update.sh](https://github.com/gabenunez/reel/blob/main/update.sh)

### Releases

Reel uses [GitHub Releases](https://github.com/gabenunez/reel/releases) for versioning. Each release is tagged `vX.Y.Z` (e.g. `v0.1.0`).

**Maintainers — cut a new release:**

1. Bump `"version"` in the root `package.json` (and workspace packages if needed)
2. Commit and push to `main`
3. Tag and push: `git tag v0.1.1 && git push origin v0.1.1`
4. GitHub Actions creates the release with auto-generated notes

Users on **Settings → Updates** will see the new version and can update in one click.

### First-time setup

1. Add your movie/TV folders in **Settings**
2. Paste your [TMDB API key](https://www.themoviedb.org/settings/api) (free, recommended for posters and metadata)
3. *(Optional)* Add an [OpenSubtitles API key](#opensubtitles-online-subtitle-search) to search and download subtitles while watching
4. Click **Scan** on each library, then browse your collection

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
- Set your OpenSubtitles API key for online subtitle search (optional)
- Check for app updates and install new GitHub releases
- Trigger library scans or refresh metadata

On first launch, Reel auto-creates a `config.yaml` if needed. You shouldn't need to edit it manually.

See [config.example.yaml](https://github.com/gabenunez/reel/blob/main/config.example.yaml) for the full schema.

## OpenSubtitles (online subtitle search)

Reel can search [OpenSubtitles.com](https://www.opensubtitles.com) while you watch, download a track, and switch between options if timing is off. This is optional — local `.srt`/`.vtt` sidecars and embedded tracks still work without an API key.

### Create an API key (free)

1. **Create an account** at [opensubtitles.com](https://www.opensubtitles.com/en/users/sign_up) (or log in if you already have one).
2. Open your profile menu (top right) → **API consumers**  
   Direct link: [opensubtitles.com/en/consumers](https://www.opensubtitles.com/en/consumers)
3. Click **New consumer** and fill in the form:
   - **Application name:** e.g. `Reel` or your server hostname
   - **Application URL:** your Reel URL (e.g. `http://192.168.1.10:8096`) or leave blank for personal use
   - **Description:** optional (e.g. `Personal media server`)
4. Submit the form. OpenSubtitles will show an **API key** — copy it immediately (you may not be able to view it again later).
5. In Reel, go to **Settings** → **OpenSubtitles**, paste the key, and click **Save key**.

### Using subtitles while watching

1. Start playback on any movie or episode.
2. Click the **CC** button in the player.
3. Choose an existing track, or click **Search online…** to find matches for your file.
4. Click **Use** on a result to download and apply it. Switch tracks anytime from the CC menu; remove downloaded OpenSubtitles tracks with **Remove**.

### Limits

The free OpenSubtitles tier has daily download limits (roughly a few downloads per IP per day). If you hit the limit, wait 24 hours or consider a [paid API plan](https://www.opensubtitles.com/en/consumers) on their site.

You can also set the key in `config.yaml`:

```yaml
subtitles:
  opensubtitles_api_key: YOUR_KEY_HERE
```

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
| `GET /api/subtitles/list` | List subtitle tracks for a file |
| `GET /api/subtitles/search` | Search OpenSubtitles for a file |
| `POST /api/subtitles/download` | Download and attach an OpenSubtitles track |
| `DELETE /api/subtitles/:id` | Remove a downloaded subtitle track |
| `POST /api/libraries/:id/scan` | Trigger library rescan |
| `POST /api/metadata/refresh` | Re-fetch TMDB metadata |
| `GET /api/updates/check` | Check GitHub for a newer release |
| `POST /api/updates/apply` | Download, build, and restart to latest release |

## Supported Video Formats

Reel indexes files by extension **and** falls back to FFprobe for unknown types (≥512 KB).

**Containers:** MKV, MP4, M4V, MOV, AVI, WebM, WMV, FLV, F4V, TS, M2TS, MTS, MPG, MPEG, DIVX, XVID, 3GP, OGV, VOB, ASF, RM, RMVB, MXF, ISO, and more.

**Playback:** Direct play for browser-friendly formats; use **Transcode** in the player for everything else (FFmpeg → H.264/AAC HLS).

**Subtitles:** SRT, VTT, ASS, SSA, SUB, IDX, SMI (external sidecars + embedded tracks). Online search/download via OpenSubtitles when an API key is configured.

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
