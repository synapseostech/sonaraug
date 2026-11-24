import { PageHeader } from "../../../components/sonara/ui.tsx";
import { SubscriptionsManager } from "../../../components/sonara/subscriptions.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";

export const metadata = { title: "Manage subscription" };

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const viewer = await requireViewer("/subscribe/manage");
  return (
    <div className="sn-stack--lg" style={{ maxWidth: 820 }}>
      <PageHeader title="Manage your subscription" />
      <SubscriptionsManager viewer={viewer} returnTo="/subscribe/manage" notice={notice} />
    </div>
  );
}
