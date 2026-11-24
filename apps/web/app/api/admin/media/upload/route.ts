import { staffCan } from "@kito/auth";
import { getViewer } from "../../../../../lib/server/auth.ts";
import { forbiddenOrigin, isSameOrigin, json } from "../../../../../lib/server/http.ts";
import { storeAudioUpload, UploadError } from "../../../../../lib/server/media.ts";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, message: "Sign in again." }, 401);
  // Refuse before reading a potentially large body.
  if (!staffCan(viewer.roles, "chronicles:edit")) return json({ ok: false, message: "Your role cannot upload Medical Chronicles audio." }, 403);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: "The upload could not be read." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, message: "Choose an audio file." }, 400);
  try {
    const asset = await storeAudioUpload(viewer, file);
    return json({ ok: true, asset: { id: asset.id, mime: asset.mime, bytes: asset.bytes, originalName: asset.originalName } });
  } catch (error) {
    if (error instanceof UploadError) return json({ ok: false, message: error.message }, 400);
    console.error(`[media] upload failed: ${(error as Error).message}`);
    return json({ ok: false, message: "The upload failed. Try again." }, 500);
  }
}
