import Link from "next/link";
import { formatMoney, INTERVAL_LABEL } from "@kito/billing";
import { Disclaimer } from "../../../components/chronicles/bits.tsx";
import { PageHeader, Panel } from "../../../components/sonara/ui.tsx";
import { activePlans } from "../../../lib/server/billing.ts";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Subscribe · Medical Chronicles" };

export default async function McSubscribePage() {
  const plans = await activePlans("listener");
  const { settings } = await read();
  return (
    <div className="sn-stack--lg">
      <PageHeader
        title="Listen to every Medical Chronicles episode"
        description={`Every series starts with ${settings.defaultFreeEpisodeAllowance} free episodes. A Sonara listener subscription unlocks the rest of every series, including new ones.`}
      />
      <div className="sn-grid-2">
        <Panel title="What is free">
          <ul className="sn-checklist">
            <li className="is-done">The first episodes of every series (the number is shown on each series)</li>
            <li className="is-done">Episodes the editors mark as free</li>
            <li className="is-done">A free account for history and saved episodes</li>
          </ul>
        </Panel>
        <Panel title="What a subscription adds">
          <ul className="sn-checklist">
            <li className="is-done">Every premium Medical Chronicles episode</li>
            <li className="is-done">Pay monthly or annually by card or Ugandan mobile money, through Flutterwave</li>
            <li className="is-done">Cancel any time; access continues to the end of the period you paid for</li>
          </ul>
        </Panel>
      </div>
      <Panel title="Plans">
        <ul className="sn-timeline">
          {plans.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {formatMoney({ amount: p.amount, currency: p.currency })} {INTERVAL_LABEL[p.interval]}
              {p.priceIsPlaceholder ? <span className="sn-placeholder"> · development price, not approved</span> : null}
            </li>
          ))}
        </ul>
        <div className="sn-row" style={{ marginTop: 12 }}>
          <Link className="kt-btn kt-btn--primary" href="/subscribe/listener">
            Choose a plan
          </Link>
        </div>
      </Panel>
      <Disclaimer />
    </div>
  );
}
