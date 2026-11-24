import { PageHeader } from "../../../components/sonara/ui.tsx";
import { SubscriptionsManager } from "../../../components/sonara/subscriptions.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";

export const metadata = { title: "Subscriptions" };

export default async function AccountSubscriptionsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const viewer = await requireViewer("/account/subscriptions");
  return (
    <>
      <PageHeader title="Subscriptions" description="Listener and creator subscriptions are separate products." />
      <SubscriptionsManager viewer={viewer} returnTo="/account/subscriptions" notice={notice} />
    </>
  );
}
