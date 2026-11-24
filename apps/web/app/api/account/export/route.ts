import { getViewer } from "../../../../lib/server/auth.ts";
import { json } from "../../../../lib/server/http.ts";
import { exportMyData } from "../../../../lib/server/users.ts";

/** A copy of the signed-in user's own data (data-subject access). */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "sign in required" }, 401);
  const data = await exportMyData(viewer);
  return json(data, 200, { "Content-Disposition": 'attachment; filename="sonara-my-data.json"' });
}
