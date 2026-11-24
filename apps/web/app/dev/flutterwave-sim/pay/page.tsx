import { notFound } from "next/navigation";
import { formatMoney } from "@kito/billing";
import { KeyValues, Notice, PageHeader, Panel } from "../../../../components/sonara/ui.tsx";
import { simCheckout, simulatorAvailable } from "../../../../lib/server/flutterwave-sim.ts";

export const metadata = { title: "Flutterwave simulator", robots: { index: false } };

/** DEVELOPMENT ONLY. Plays the role of Flutterwave's hosted payment page. No money moves. */
export default async function SimulatorPayPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  if (!(await simulatorAvailable())) notFound();
  const { ref } = await searchParams;
  const checkout = ref ? await simCheckout(ref) : null;
  if (!checkout) notFound();
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }} className="sn-stack">
      <PageHeader eyebrow="Local Flutterwave simulator" title="Simulated payment page" />
      <Notice tone="warn" title="This is not Flutterwave and no money moves">
        A development stand-in for Flutterwave&apos;s hosted checkout. It sends a signed webhook to Sonara and answers Sonara&apos;s verification request, so
        the real integration code runs end to end.
      </Notice>
      <Panel title="Order">
        <KeyValues
          items={[
            ["Amount", formatMoney({ amount: checkout.amount, currency: checkout.currency })],
            ["Description", checkout.description],
            ["Customer", checkout.customerEmail],
            ["Reference", <span key="r" className="sn-mono">{checkout.txRef}</span>],
            ["Payment options", checkout.paymentOptions],
            ["Recurring plan", checkout.paymentPlan ?? "none"],
          ]}
        />
      </Panel>
      <Panel title="Choose what happens">
        {/* A plain form POST: the browser leaves this page by a top-level redirect, as with the real provider. */}
        <form action="/api/dev/flutterwave-sim/pay" method="post" className="sn-form">
          <input type="hidden" name="ref" value={checkout.txRef} />
          <div className="sn-choice">
            {[
              ["successful", "Payment succeeds"],
              ["failed", "Payment fails (declined)"],
              ["underpaid", "Customer pays half the amount (amount mismatch)"],
              ["wrong_currency", "Paid in the wrong currency (currency mismatch)"],
              ["abandoned", "Customer abandons checkout"],
            ].map(([value, label], i) => (
              <label key={value}>
                <input type="radio" name="outcome" value={value} defaultChecked={i === 0} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="sn-choice">
            <label>
              <input type="radio" name="method" value="mobilemoneyuganda" defaultChecked />
              <span>Mobile money (Uganda)</span>
            </label>
            <label>
              <input type="radio" name="method" value="card" />
              <span>Card</span>
            </label>
          </div>
          <label className="sn-check">
            <input type="checkbox" name="webhook" defaultChecked />
            <span>Send the charge.completed webhook</span>
          </label>
          <label className="sn-check">
            <input type="checkbox" name="duplicate" />
            <span>Deliver the webhook twice (duplicate delivery)</span>
          </label>
          <button className="kt-btn kt-btn--primary" type="submit">
            Complete simulated payment
          </button>
        </form>
      </Panel>
    </div>
  );
}
