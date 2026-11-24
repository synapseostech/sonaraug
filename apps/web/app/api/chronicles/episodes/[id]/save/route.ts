import { getViewer } from "../../../../../../lib/server/auth.ts";
import { toggleSaved } from "../../../../../../lib/server/chronicles.ts";
import { forbiddenOrigin, isSameOrigin, json } from "../../../../../../lib/server/http.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, message: "Sign in to save episodes." }, 401);
  const { id } = await context.params;
  try {
    return json({ ok: true, saved: await toggleSaved(viewer, id) });
  } catch {
    return json({ ok: false, message: "Episode not found." }, 404);
  }
}
