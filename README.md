# Reel

Self-hosted movies and TV. One Node app, SQLite, FFmpeg for transcoding.

**[github.com/gabenunez/reel](https://github.com/gabenunez/reel)**

## Install

**Linux VPS**

```bash
curl -fsSL https://raw.githubusercontent.com/gabenunez/reel/main/install.sh | bash
```

Open `http://YOUR_SERVER:8096/settings` and add library folders.

**From source**

```bash
git clone https://github.com/gabenunez/reel.git && cd reel
pnpm install && pnpm build && pnpm start
```

Dev with hot reload: `./scripts/dev.sh`

**Update:** Settings → Updates in the app, or `./update.sh`

## Setup

1. Add movie/TV folders in **Settings**
2. Add a [TMDB API key](https://www.themoviedb.org/settings/api) (posters & metadata)
3. Scan libraries, then browse

Optional: FFmpeg for transcoding and Chromecast; OpenSubtitles API key in Settings for online subtitles.

## License

MIT
