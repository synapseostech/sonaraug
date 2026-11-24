import { formatMoney } from "@kito/billing";
import { DataTable, Empty, PageHeader, Panel, Pill, formatDate } from "../../../components/sonara/ui.tsx";
import { ActionForm, SubmitButton, TextField } from "../../../components/sonara/forms.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { billingOverviewFor } from "../../../lib/server/billing.ts";
import { requestRefundAction } from "../../subscribe/actions.ts";

export const metadata = { title: "Payment history" };

const TONE = { successful: "ok", failed: "danger", mismatch: "danger", pending: "warn", initiated: "neutral", reversed: "info" } as const;

export default async function PaymentHistoryPage() {
  const viewer = await requireViewer("/account/payment-history");
  const { transactions, plans } = await billingOverviewFor(viewer);
  const refundable = transactions.filter((t) => t.status === "successful" && t.refundStatus === "none");
  return (
    <>
      <PageHeader title="Payment history" />
      <DataTable
        caption="Your payments"
        rows={transactions}
        rowKey={(t) => t.id}
        empty={<Empty title="No payments yet" />}
        columns={[
          { key: "date", header: "Date", cell: (t) => formatDate(t.createdAt, true) },
          { key: "plan", header: "Plan", cell: (t) => plans.find((p) => p.id === t.planId)?.name ?? t.planId },
          { key: "amount", header: "Amount", numeric: true, cell: (t) => formatMoney({ amount: t.amount, currency: t.currency }) },
          { key: "status", header: "Status", cell: (t) => <Pill tone={TONE[t.status]}>{t.status}</Pill> },
          { key: "method", header: "Method", cell: (t) => t.paymentType ?? "—" },
          { key: "ref", header: "Reference", cell: (t) => <span className="sn-mono">{t.txRef}</span> },
          { key: "env", header: "Mode", cell: (t) => (t.environment === "live" ? "Live" : t.environment === "test" ? "Test" : "Simulated") },
          { key: "refund", header: "Refund", cell: (t) => (t.refundStatus === "none" ? "—" : t.refundStatus) },
        ]}
      />
      {refundable.length ? (
        <Panel title="Request a refund" subtitle="Our finance team reviews every request.">
          {refundable.slice(0, 5).map((t) => (
            <ActionForm key={t.id} action={requestRefundAction} aria-label={`Refund ${t.txRef}`}>
              <input type="hidden" name="transactionId" value={t.id} />
              <TextField name="reason" label={`Reason for refunding ${t.txRef}`} required minLength={5} maxLength={500} />
              <div><SubmitButton variant="secondary">Request refund</SubmitButton></div>
            </ActionForm>
          ))}
        </Panel>
      ) : null}
    </>
  );
}
