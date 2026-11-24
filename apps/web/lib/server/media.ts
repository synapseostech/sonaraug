/**
 * Media storage — LOCAL DISK, DEVELOPMENT ONLY.
 *
 * Uploaded audio is written under .data/media on the server (git-ignored) and
 * served by /api/media/[id] only after an entitlement check. Bytes never go into
 * the database. The production adapter is Cloudflare R2 with short-lived signed
 * URLs (ADR-0004, roadmap W3), which is not provisioned; `storageStatus()` says so.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sniffAudioType, UPLOAD_AUDIO_TYPES, type UploadAudioType } from "@kito/chronicles";
import { staffCan } from "@kito/auth";
import type { Viewer } from "./auth.ts";
import { appendAudit } from "./audit.ts";
import { requestId } from "./request.ts";
import { randomId } from "./crypto.ts";
import { asService, asViewer, readData, scope, where, writeData } from "./data.ts";
import { dataDirectory } from "./store.ts";
import type { MediaAsset } from "./types.ts";

export const MAX_AUDIO_BYTES = Number(process.env.SONARA_MAX_AUDIO_MB || 300) * 1024 * 1024;

const mediaDir = () => path.join(dataDirectory(), "media");

export function storageStatus(): { available: boolean; backend: "local_disk" | "none"; note: string } {
  if (process.env.NODE_ENV === "production" && process.env.SONARA_ALLOW_DEV_BACKEND !== "1") {
    return { available: false, backend: "none", note: "Production media storage (Cloudflare R2) is not configured. Uploads are disabled." };
  }
  return { available: true, backend: "local_disk", note: "Development storage on this machine's disk. Not durable, not backed up, not a CDN." };
}

export class UploadError extends Error {}

export async function storeAudioUpload(viewer: Viewer, file: File): Promise<MediaAsset> {
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
