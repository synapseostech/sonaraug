/**
 * Media storage for Medical Chronicles audio.
 *
 *   dev backend      — LOCAL DISK under .data/media (git-ignored). Files go
 *                      through /api/admin/media/upload. Not durable.
 *   supabase backend — a PRIVATE Supabase Storage bucket (mc-audio, migration
 *                      0200). The browser uploads straight to Storage with a
 *                      one-time signed upload URL (Vercel functions cannot take
 *                      bodies over 4.5 MB, and NotebookLM audio is 20–80 MB);
 *                      the server then streams the object once to check its
 *                      magic bytes, size and sha256 before registering it.
 *
 * Either way the bytes are served only by /api/media/[id] after an entitlement
 * check: from disk in dev, or as a redirect to a short-lived signed URL.
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sniffAudioType, UPLOAD_AUDIO_TYPES, type UploadAudioType } from "@kito/chronicles";
import { staffCan } from "@kito/auth";
import type { Viewer } from "./auth.ts";
import { appendAudit } from "./audit.ts";
import { requestId } from "./request.ts";
import { randomId } from "./crypto.ts";
import { asService, asViewer, isSupabase, readData, scope, where, writeData } from "./data.ts";
import { dataDirectory } from "./store.ts";
import type { MediaAsset } from "./types.ts";

export const AUDIO_BUCKET = process.env.SONARA_AUDIO_BUCKET || "mc-audio";
/** How long a listener's signed audio link lives. Long enough for a lecture-length episode with seeking. */
const SIGNED_URL_SECONDS = 3 * 60 * 60;
export const MAX_AUDIO_BYTES = Number(process.env.SONARA_MAX_AUDIO_MB || 300) * 1024 * 1024;

const mediaDir = () => path.join(dataDirectory(), "media");

export function storageStatus(): { available: boolean; backend: "local_disk" | "supabase" | "none"; note: string } {
  if (isSupabase()) {
    return { available: true, backend: "supabase", note: `Private Supabase Storage bucket “${AUDIO_BUCKET}”. Listeners receive short-lived signed links only after an access check.` };
  }
  if (process.env.NODE_ENV === "production" && process.env.SONARA_ALLOW_DEV_BACKEND !== "1") {
    return { available: false, backend: "none", note: "Production media storage (Cloudflare R2) is not configured. Uploads are disabled." };
  }
  return { available: true, backend: "local_disk", note: "Development storage on this machine's disk. Not durable, not backed up, not a CDN." };
}

export class UploadError extends Error {}

export async function storeAudioUpload(viewer: Viewer, file: File): Promise<MediaAsset> {
  if (isSupabase()) throw new UploadError("Uploads go directly to storage on this deployment. Reload the page and try again.");
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new UploadError("Your role cannot upload Medical Chronicles audio.");
  if (!storageStatus().available) throw new UploadError(storageStatus().note);
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > MAX_AUDIO_BYTES) throw new UploadError(`Files must be under ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffAudioType(bytes.subarray(0, 32));
  if (!mime) throw new UploadError("That file is not a supported audio format (MP3, M4A, AAC, OGG, WAV or WebM audio). The file contents were checked, not just its name.");
  const id = randomId("aud");
  const ext = UPLOAD_AUDIO_TYPES[mime as UploadAudioType][0];
  await fs.mkdir(mediaDir(), { recursive: true, mode: 0o700 });
  const filePath = path.join(mediaDir(), `${id}${ext}`);
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
  const asset: MediaAsset = {
    id,
    kind: "audio",
    mime,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storage: "local_disk",
    path: path.basename(filePath),
    originalName: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120),
    uploadedBy: viewer.id,
    createdAt: new Date().toISOString(),
  };
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), {}), (data) => {
    data.media.push(asset);
    appendAudit(data, { actor: { id: viewer.id, roles: viewer.roles }, action: "media.uploaded", entityType: "media_asset", entityId: id, after: { mime, bytes: asset.bytes, sha256: asset.sha256, originalName: asset.originalName } }, reqId);
  });
  return asset;
}

const ASSET_ID = /^(aud_[a-f0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export async function assetFile(id: string): Promise<{ asset: MediaAsset; filePath: string } | null> {
  if (!ASSET_ID.test(id)) return null;
  // Location lookup only; whether the caller may stream it is decided by canStreamAsset.
  const data = await readData(scope(asService("media location"), { media: where("t.id::text = $1", id) }));
  const asset = data.media.find((m) => m.id === id);
  if (!asset) return null;
  // The stored name is our own; still refuse anything that could escape the directory.
  const filePath = path.join(mediaDir(), path.basename(asset.path));
  return { asset, filePath };
}

/* ------------------------------------------------------- Supabase Storage */

const EXTENSION_TYPES: Record<string, UploadAudioType> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", webm: "audio/webm", weba: "audio/webm",
};

/** The canonical content type for an upload, from its name (browsers report m4a/wav inconsistently). */
export function uploadContentType(name: string, declared: string): UploadAudioType | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (EXTENSION_TYPES[ext]) return EXTENSION_TYPES[ext]!;
  return (Object.keys(UPLOAD_AUDIO_TYPES) as UploadAudioType[]).includes(declared as UploadAudioType) ? (declared as UploadAudioType) : null;
}

const objectPath = (assetId: string) => `episodes/${assetId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function storage() {
  const { adminClient } = await import("./sb/supabase.ts");
  return adminClient().storage.from(AUDIO_BUCKET);
}

export type UploadTicket = { assetId: string; uploadUrl: string; contentType: UploadAudioType };

/** Step 1: a one-time URL the editor's browser PUTs the file to. Nothing is registered yet. */
export async function createUploadTicket(viewer: Viewer, input: { name: string; size: number; type: string }): Promise<UploadTicket> {
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new UploadError("Your role cannot upload Medical Chronicles audio.");
  if (!isSupabase()) throw new UploadError("Direct uploads need the Supabase backend.");
  if (!Number.isFinite(input.size) || input.size <= 0) throw new UploadError("The file is empty.");
  if (input.size > MAX_AUDIO_BYTES) throw new UploadError(`Files must be under ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB.`);
  const contentType = uploadContentType(input.name, input.type);
  if (!contentType) throw new UploadError("Choose an MP3, M4A, AAC, OGG, WAV or WebM audio file.");
  const assetId = randomUUID();
  const { data, error } = await (await storage()).createSignedUploadUrl(objectPath(assetId));
  if (error || !data) {
    console.error(`[media] signed upload URL failed: ${error?.message}`);
    throw new UploadError(/bucket not found/i.test(error?.message ?? "") ? `The storage bucket “${AUDIO_BUCKET}” does not exist yet. Apply migration 0200.` : "Storage refused the upload. Try again.");
  }
  return { assetId, uploadUrl: data.signedUrl, contentType };
}

/**
 * Step 2: after the browser's PUT succeeds. Streams the stored object once to
 * verify it really is audio (magic bytes, not the name) and to record its size
 * and sha256, then registers it. Anything else is deleted from the bucket.
 */
export async function completeUpload(viewer: Viewer, assetId: string, originalName: string): Promise<MediaAsset> {
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new UploadError("Your role cannot upload Medical Chronicles audio.");
  if (!UUID.test(assetId)) throw new UploadError("Unknown upload.");
  const bucket = await storage();
  const key = objectPath(assetId);
  const { data: signed, error } = await bucket.createSignedUrl(key, 120);
  if (error || !signed) throw new UploadError("The uploaded file was not found in storage. Upload it again.");
  const response = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!response.ok || !response.body) throw new UploadError("The uploaded file could not be read back from storage.");
  const hash = createHash("sha256");
  const head: Buffer[] = [];
  let headBytes = 0;
  let bytes = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    bytes += value.byteLength;
    if (headBytes < 32) {
      head.push(Buffer.from(value.subarray(0, 32 - headBytes)));
      headBytes += Math.min(value.byteLength, 32 - headBytes);
    }
    if (bytes > MAX_AUDIO_BYTES) break;
  }
  const mime = sniffAudioType(Buffer.concat(head));
  if (!mime || bytes === 0 || bytes > MAX_AUDIO_BYTES) {
    await bucket.remove([key]);
    throw new UploadError(bytes > MAX_AUDIO_BYTES ? "That file is too large." : "That file is not a supported audio format (MP3, M4A, AAC, OGG, WAV or WebM audio). The file contents were checked, not just its name.");
  }
  const asset: MediaAsset = {
    id: assetId,
    kind: "audio",
    mime,
    bytes,
    sha256: hash.digest("hex"),
    storage: "supabase",
    path: key,
    originalName: originalName.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "audio",
    uploadedBy: viewer.id,
    createdAt: new Date().toISOString(),
  };
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), {}), (data) => {
    data.media.push(asset);
    appendAudit(data, { actor: { id: viewer.id, roles: viewer.roles }, action: "media.uploaded", entityType: "media_asset", entityId: assetId, after: { mime, bytes, sha256: asset.sha256, originalName: asset.originalName, storage: "supabase" } }, reqId);
  });
  return asset;
}

/** A short-lived link to a stored object. Call only after the access check. */
export async function signedAudioUrl(asset: MediaAsset): Promise<string | null> {
  if (asset.storage !== "supabase") return null;
  const { data, error } = await (await storage()).createSignedUrl(asset.path, SIGNED_URL_SECONDS);
  if (error || !data) {
    console.error(`[media] signing ${asset.id} failed: ${error?.message}`);
    return null;
  }
  return data.signedUrl;
}
