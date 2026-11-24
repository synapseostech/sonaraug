import Link from "next/link";
import { KeyValues, PageHeader, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { currentUserRecord, listSessions, requireViewer } from "../../../lib/server/auth.ts";
import { PasswordForm } from "../forms.tsx";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const viewer = await requireViewer("/account/security");
  const [user, sessions] = await Promise.all([currentUserRecord(viewer), listSessions(viewer)]);
  return (
    <>
      <PageHeader title="Security" />
      <Panel title="Sign-in">
        <KeyValues
          items={[
            ["Method", "Email and password"],
            ["Signed-in devices", <Link key="d" className="sn-link" href="/account/devices">{sessions.length}</Link>],
            ["Account locked", user?.lockedUntil && Date.parse(user.lockedUntil) > Date.now() ? `Until ${formatDate(user.lockedUntil, true)}` : "No"],
            ["Two-step verification", "Not available yet"],
          ]}
        />
      </Panel>
      <Panel title="Change password" subtitle="Changing your password signs out your other devices.">
        <PasswordForm />
      </Panel>
    </>
  );
}
