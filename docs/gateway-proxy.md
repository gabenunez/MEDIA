# Reverse-proxy gateway mode

Use this when MEDIA! sits behind a reverse proxy that only forwards a **single public entry path** (for example `https://example.com/reel`) and strips or breaks deeper paths like `/reel/_next/...` or `/reel/api/...`.

The app stays mounted at `/` internally. The browser talks to one public URL; `proxy.ts` fans requests out to the real routes.

## How it works

| Browser requests | Apache forwards | `proxy.ts` rewrites to |
|------------------|-----------------|------------------------|
| `GET /reel` | `GET /` | home page |
| `GET /reel?__p=/media/5/` | `GET /?__p=/media/5/` | `/media/5/` |
| `GET /reel?__p=/_next/static/chunk.js` | `GET /?__p=/_next/static/chunk.js` | `/_next/static/chunk.js` |
| `GET /reel?__p=/api/status` | `GET /?__p=/api/status` | `/api/status` |

- **`__p`** — internal path encoded in the public entry query string
- **`assetPrefix`** — build emits script/style URLs through `/reel?__p=/_next/...`
- **`routes.*` / `publicUrl()`** — links, fetches, and stream URLs use the gateway when enabled

No Next.js `basePath` is required.

## Enable

Set at **build time** (baked into the client bundle):

```bash
export MEDIA_GATEWAY_PREFIX=/reel
pnpm build
```

Restart with the same prefix (or rely on the build-time `NEXT_PUBLIC_GATEWAY_PREFIX`):

```bash
export MEDIA_GATEWAY_PREFIX=/reel
bash scripts/start-prod.sh
```

### Optional overrides

| Variable | Purpose |
|----------|---------|
| `MEDIA_GATEWAY_PREFIX` | Public entry path (e.g. `/reel`) |
| `NEXT_PUBLIC_API_URL` | If set, API/stream/image URLs use this absolute base instead of the gateway |

When `NEXT_PUBLIC_API_URL` is unset, API calls go through `/reel?__p=/api/...` like everything else.

## Direct access unchanged

Without `MEDIA_GATEWAY_PREFIX`, gateway mode is off:

- `http://your-server:8096/` works as before
- `routes.home()` returns `/`
- `proxy.ts` only handles legacy route redirects

## Limitations

- **Build-time prefix** — change `MEDIA_GATEWAY_PREFIX` → rebuild
- **Apache must forward `/reel` with query strings** — if the host strips `?__p=...`, this mode cannot work
- **HLS segment URLs** — playlists must resolve through `publicUrl()`; report issues if a player requests non-gateway paths

## Files

| File | Role |
|------|------|
| `packages/web/lib/gateway.ts` | URL helpers (`toGatewayUrl`, `publicUrl`, parsers) |
| `packages/web/proxy.ts` | Rewrites `?__p=` to internal paths |
| `packages/web/next.config.mjs` | Sets `assetPrefix` when gateway prefix is configured |
| `packages/web/lib/routes.ts` | Navigation URLs |
