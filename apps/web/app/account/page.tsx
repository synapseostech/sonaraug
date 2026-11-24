import Link from "next/link";
import { KeyValues, PageHeader, Panel, Pill, formatDate } from "../../components/sonara/ui.tsx";
import { ActionForm, SubmitButton } from "../../components/sonara/forms.tsx";
import { currentUserRecord, requireViewer } from "../../lib/server/auth.ts";
import { listenerEntitlementFor } from "../../lib/server/entitlements.ts";
import { read } from "../../lib/server/store.ts";
import { signOutAction } from "./actions.ts";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const viewer = await requireViewer("/account");
  const user = await currentUserRecord(viewer);
  const data = await read();
  const entitlement = listenerEntitlementFor(data, viewer.id);
  const unread = data.notifications.filter((n) => n.userId === viewer.id && !n.readAt).length;
  const recent = data.listening.filter((l) => l.userId === viewer.id).length;
  return (
    <>
      <PageHeader
        title={`Hello, ${viewer.displayName}`}
        description="Your Sonara account. Only you can see this page."
        actions={
          <form action={signOutAction}>
            <button className="kt-btn kt-btn--ghost" type="submit">
              Sign out
            </button>
          </form>
        }
      />
      <div className="sn-grid-2">
        <Panel title="Plan" actions={<Link className="sn-link" href="/account/subscriptions">Manage</Link>}>
          <KeyValues
            items={[
              ["Listening", entitlement.premium ? <Pill tone="ok">Premium</Pill> : <Pill>Free</Pill>],
              ["Access until", entitlement.accessUntil ? formatDate(entitlement.accessUntil) : "—"],
            ]}
          />
          {!entitlement.premium ? (
            <Link className="kt-btn kt-btn--primary kt-btn--sm" href="/subscribe/listener" style={{ marginTop: 12 }}>
              Unlock premium episodes
            </Link>
          ) : null}
        </Panel>
        <Panel title="Account" actions={<Link className="sn-link" href="/account/profile">Edit</Link>}>
          <KeyValues
            items={[
              ["Email", viewer.email],
              ["Verified", viewer.emailVerified ? <Pill tone="ok">Verified</Pill> : <Pill tone="warn">Not verified</Pill>],
              ["Member since", formatDate(user?.createdAt)],
              ["Staff roles", viewer.roles.length ? viewer.roles.join(", ") : "None"],
            ]}
          />
        </Panel>
        <Panel title="Activity">
          <KeyValues
            items={[
              ["Unread notifications", <Link key="n" className="sn-link" href="/account/notifications">{unread}</Link>],
              ["Episodes started", <Link key="h" className="sn-link" href="/account/listening-history">{recent}</Link>],
            ]}
          />
        </Panel>
        {viewer.isStaff ? (
          <Panel title="Staff">
            <Link className="kt-btn kt-btn--secondary" href="/admin">
              Open the admin console
            </Link>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
