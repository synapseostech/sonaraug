import { getViewer } from "../../../../../../lib/server/auth.ts";
import { resolvePlayback } from "../../../../../../lib/server/chronicles.ts";
import { forbiddenOrigin, isSameOrigin, json } from "../../../../../../lib/server/http.ts";

/**
 * Returns how to play an episode, after the server-side access check.
 * 200 { mode: "sonara", url } | 200 { mode: "external", provider, url } | 403/404 { reason, message }
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const { id } = await context.params;
  const viewer = await getViewer();
  const result = await resolvePlayback(id, viewer);
  if (result.ok) return json(result);
  const status = result.reason === "not_found" ? 404 : result.reason === "sign_in_required" ? 401 : result.reason === "source_unavailable" || result.reason === "no_source" ? 409 : 403;
  return json(result, status);
}
