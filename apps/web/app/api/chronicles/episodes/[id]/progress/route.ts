import { getViewer } from "../../../../../../lib/server/auth.ts";
import { recordProgress } from "../../../../../../lib/server/chronicles.ts";
import { forbiddenOrigin, isSameOrigin, json } from "../../../../../../lib/server/http.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false }, 401);
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { positionSeconds?: unknown } | null;
  const position = typeof body?.positionSeconds === "number" ? body.positionSeconds : Number.NaN;
  await recordProgress(viewer, id, position);
  return json({ ok: true });
}
