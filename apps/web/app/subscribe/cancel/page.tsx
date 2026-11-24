import { Notice, PageHeader } from "../../../components/sonara/ui.tsx";
import { SubscriptionsManager } from "../../../components/sonara/subscriptions.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";

export const metadata = { title: "Cancel subscription" };

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const viewer = await requireViewer("/subscribe/cancel");
  return (
    <div className="sn-stack--lg" style={{ maxWidth: 820 }}>
      <PageHeader title="Cancel your subscription" description="Cancelling stops renewal. You keep premium access until the end of the period you have already paid for. There is no partial refund for the current period unless the law or our refund policy requires one." />
      <Notice tone="info">You can change your mind before the period ends and keep your subscription.</Notice>
      <SubscriptionsManager viewer={viewer} showCancelOnly returnTo="/subscribe/cancel" notice={notice} />
    </div>
  );
}
