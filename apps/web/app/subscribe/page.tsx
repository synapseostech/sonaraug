import Link from "next/link";
import { PageHeader, Panel } from "../../components/sonara/ui.tsx";
import { PlanCard } from "../../components/sonara/plans.tsx";
import { activePlans } from "../../lib/server/billing.ts";

export const metadata = { title: "Subscribe" };

export default async function SubscribePage() {
  const [listener, creator] = await Promise.all([activePlans("listener"), activePlans("creator")]);
  return (
    <div className="sn-stack--lg">
      <PageHeader title="Subscribe to Sonara" description="Two separate products. A listener subscription unlocks premium listening; a creator plan unlocks publishing. One never includes the other." />
      <Panel title="For listeners" subtitle="Premium Medical Chronicles episodes. Free accounts keep the free episodes.">
        <div className="sn-plans">
          {listener.map((plan, i) => (
            <PlanCard key={plan.id} plan={plan} featured={i === 0} cta={{ href: `/subscribe/checkout?plan=${plan.id}`, label: "Choose plan" }} />
          ))}
        </div>
      </Panel>
      <Panel title="For creators" subtitle="Publishing on Sonara needs an approved creator application and a creator plan. Paying does not approve an application.">
        <div className="sn-plans">
          {creator.map((plan) => (
            <PlanCard key={plan.id} plan={plan} cta={null} />
          ))}
        </div>
        <p className="sn-small">
          Creator onboarding (application, review, plan checkout) is the next build wave. <Link className="sn-link" href="/legal/terms">Terms</Link>
        </p>
      </Panel>
    </div>
  );
}
