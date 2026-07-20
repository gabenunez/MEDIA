import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  MEDIA_INTERNAL_HEADER,
  MEDIA_INTERNAL_TOKEN,
  mediaPageCacheTag,
} from "@media-app/shared";

export async function POST(request: Request) {
  const token = request.headers.get(MEDIA_INTERNAL_HEADER);
  if (token !== MEDIA_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tag?: string; mediaId?: number; paths?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mediaId =
    typeof body.mediaId === "number" && Number.isFinite(body.mediaId)
      ? body.mediaId
      : null;

  const tag =
    typeof body.tag === "string" && body.tag.trim()
      ? body.tag.trim()
      : mediaId != null
        ? mediaPageCacheTag(mediaId)
        : null;

  if (!tag) {
    return NextResponse.json({ error: "tag or mediaId required" }, { status: 400 });
  }

  revalidateTag(tag, { expire: 0 });

  const fromTag = tag.match(/^media:(\d+)$/);
  const pathId = mediaId ?? (fromTag ? parseInt(fromTag[1], 10) : NaN);
  if (Number.isFinite(pathId) && pathId > 0) {
    revalidatePath(`/media/${pathId}/`);
  }

  const extraPaths = Array.isArray(body.paths) ? body.paths : [];
  for (const path of extraPaths) {
    if (typeof path === "string" && path.startsWith("/")) {
      revalidatePath(path);
    }
  }

  return NextResponse.json({ revalidated: true, tag, paths: extraPaths });
}
