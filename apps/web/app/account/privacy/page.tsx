import Link from "next/link";
import { KeyValues, Notice, PageHeader, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { currentUserRecord, requireViewer } from "../../../lib/server/auth.ts";

export const metadata = { title: "Privacy and data" };

export default async function PrivacyPage() {
  const viewer = await requireViewer("/account/privacy");
  const user = await currentUserRecord(viewer);
  return (
    <>
      <PageHeader title="Privacy and your data" />
      <Panel title="What you agreed to">
        <KeyValues
          items={[
            ["Terms version", user?.termsVersion ?? "—"],
            ["Privacy notice version", user?.privacyVersion ?? "—"],
            ["Accepted", formatDate(user?.termsAcceptedAt, true)],
            ["Marketing emails", user?.marketingConsent ? "Yes" : "No"],
          ]}
        />
        <p className="sn-small">
          <Link className="sn-link" href="/legal/privacy">Read the privacy notice</Link> · <Link className="sn-link" href="/account/preferences">Change marketing consent</Link>
        </p>
      </Panel>
      <Panel title="Download your data" subtitle="A JSON copy of your profile, subscriptions, payments, listening history, saved items and notifications.">
        <a className="kt-btn kt-btn--secondary" href="/api/account/export" download>
          Download my data
        </a>
      </Panel>
      <Notice tone="info">Payment card and mobile-money details are held by Flutterwave, not by Sonara.</Notice>
    </>
  );
}
