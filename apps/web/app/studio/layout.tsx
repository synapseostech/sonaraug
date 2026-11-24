import type { ReactNode } from "react";
import { WorkspaceFrame } from "../../components/workspace-nav.tsx";
import { StudioProvider } from "../../lib/studio/store.tsx";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <StudioProvider>
      <WorkspaceFrame kind="studio">{children}</WorkspaceFrame>
    </StudioProvider>
  );
}
