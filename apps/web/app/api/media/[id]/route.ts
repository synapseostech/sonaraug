import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { getViewer } from "../../../../lib/server/auth.ts";
import { canStreamAsset } from "../../../../lib/server/chronicles.ts";
import { assetFile, signedAudioUrl } from "../../../../lib/server/media.ts";

/**
 * Streams uploaded audio after the same access check as playback. Supports
 * HTTP Range so the Sonara player can seek. Responses are private and never
 * cached by shared caches.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const episodeId = new URL(request.url).searchParams.get("e") ?? "";
  const found = await assetFile(id);
  if (!found) return new Response("Not found", { status: 404 });
  const viewer = await getViewer();
  if (!(await canStreamAsset(id, episodeId, viewer))) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });

  if (found.asset.storage === "supabase") {
    // Private bucket: hand this listener a short-lived signed link. Sharing it expires; sharing /api/media grants nothing.
    const url = await signedAudioUrl(found.asset);
    if (!url) return new Response("Media temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }

  let size: number;
  try {
    size = (await fs.stat(found.filePath)).size;
  } catch {
    return new Response("Media missing from storage", { status: 410 });
  }
  const base = {
    "Content-Type": found.asset.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (range && !match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  if (match) {
    let start = match[1] ? Number(match[1]) : Number.NaN;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (Number.isNaN(start)) {
      start = Math.max(0, size - end);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(found.filePath, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(found.filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...base, "Content-Length": String(size) } });
}
