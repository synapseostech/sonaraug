import { DataTable, PageHeader, Panel, Pill, formatDate } from "../../../components/sonara/ui.tsx";
import { ActionForm, SubmitButton } from "../../../components/sonara/forms.tsx";
import { listSessions, requireViewer } from "../../../lib/server/auth.ts";
import { revokeSessionAction } from "../actions.ts";

export const metadata = { title: "Devices" };

function describe(agent: string): string {
  const browser = /Firefox\//.test(agent) ? "Firefox" : /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS X/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" on ");
}

export default async function DevicesPage() {
  const viewer = await requireViewer("/account/devices");
  const sessions = await listSessions(viewer);
  return (
    <>
      <PageHeader title="Signed-in devices" />
      <DataTable
        caption="Sessions"
        rows={sessions}
        rowKey={(s) => s.id}
        columns={[
          { key: "device", header: "Device", cell: (s) => <>{describe(s.userAgent)} {s.id === viewer.sessionId ? <Pill tone="ok">This device</Pill> : null}</> },
          { key: "since", header: "Signed in", cell: (s) => formatDate(s.createdAt, true) },
          { key: "seen", header: "Last active", cell: (s) => formatDate(s.lastSeenAt, true) },
          {
            key: "act",
            header: "",
            cell: (s) => (
              <ActionForm action={revokeSessionAction} className="sn-inline-form">
                <input type="hidden" name="sessionId" value={s.id} />
                <SubmitButton variant="ghost">{s.id === viewer.sessionId ? "Sign out" : "Sign out device"}</SubmitButton>
              </ActionForm>
            ),
          },
        ]}
      />
      {sessions.length > 1 ? (
        <Panel title="Everywhere else">
          <ActionForm action={revokeSessionAction} className="sn-inline-form" confirm="Sign out of every other device?">
            <input type="hidden" name="sessionId" value="others" />
            <SubmitButton variant="secondary">Sign out of all other devices</SubmitButton>
          </ActionForm>
        </Panel>
      ) : null}
    </>
  );
}
