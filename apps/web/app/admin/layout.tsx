import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccessDenied } from "../../components/sonara/ui.tsx";
import { WorkspaceFrame } from "../../components/workspace-nav.tsx";
import { getViewer } from "../../lib/server/auth.ts";
import { StudioProvider } from "../../lib/studio/store.tsx";

/**
 * The admin console requires a signed-in staff account, checked on the server.
 * Each page and action checks its own permission as well (layouts are not
 * re-run on client navigation). The Demo sections still read the local studio
 * store, which is why StudioProvider remains here.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/login?next=/admin");
  if (!viewer.isStaff) {
    return (
      <AccessDenied title="The admin console is for Sonara staff">
        Your account does not have a staff role. Staff roles are granted by a Sonara administrator.
      </AccessDenied>
    );
  }
  return (
    <StudioProvider>
      <WorkspaceFrame kind="admin" staff={{ displayName: viewer.displayName, roles: viewer.roles }}>
        {children}
      </WorkspaceFrame>
    </StudioProvider>
  );
}
