import Link from "next/link";
import { Empty, PageHeader, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { ActionForm, SubmitButton } from "../../../components/sonara/forms.tsx";
import { currentUserRecord, requireViewer } from "../../../lib/server/auth.ts";
import { emailDeliveryConfigured, NOTIFICATION_KIND_LABEL, OPTIONAL_KINDS } from "../../../lib/server/notify.ts";
import { viewerInbox } from "../../../lib/server/users.ts";
import { markAllReadAction } from "../actions.ts";
import { EmailPreferencesForm } from "../forms.tsx";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("/account/notifications");
  const [inbox, user] = await Promise.all([viewerInbox(viewer), currentUserRecord(viewer)]);
  const unread = inbox.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" />
      <Panel
        title="Inbox"
        subtitle={`${unread} unread`}
        actions={unread ? (<ActionForm action={markAllReadAction} className="sn-inline-form"><SubmitButton variant="ghost">Mark all read</SubmitButton></ActionForm>) : null}
      >
        {inbox.length === 0 ? (
          <Empty title="No notifications" />
        ) : (
          <ul className="sn-timeline">
            {inbox.map((n) => (
              <li key={n.id} style={{ borderLeftColor: n.readAt ? undefined : "var(--kt-accent)" }}>
                <time dateTime={n.createdAt}>{formatDate(n.createdAt, true)}{n.readAt ? "" : " · new"}</time>
                <strong>{n.title}</strong> {n.body}
                {n.link ? <> <Link className="sn-link" href={n.link}>Open</Link></> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Email notifications" subtitle={emailDeliveryConfigured() ? "Receipts, payment problems, password resets and security alerts are always sent." : "Email delivery is not configured on this deployment; messages appear in your inbox above."}>
        <EmailPreferencesForm kinds={OPTIONAL_KINDS.map((kind) => ({ kind, label: NOTIFICATION_KIND_LABEL[kind], enabled: user?.emailPreferences[kind] !== false }))} />
      </Panel>
    </>
  );
}
