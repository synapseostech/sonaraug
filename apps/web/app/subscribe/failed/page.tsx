import Link from "next/link";
import { Notice, PageHeader } from "../../../components/sonara/ui.tsx";
import { getViewer } from "../../../lib/server/auth.ts";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Payment not completed" };

const COPY: Record<string, string> = {
  failed: "The payment was declined or failed. No money was taken by Sonara.",
  mismatch: "The payment we received did not match the order (amount or currency). No access was granted; our finance team will review it and refund if money was taken.",
  abandoned: "The payment was cancelled before it finished.",
  pending: "We have not received confirmation yet. If money left your account, access will start as soon as Flutterwave confirms it.",
  unknown: "We could not match this payment to an order.",
};

export default async function FailedPage({ searchParams }: { searchParams: Promise<{ ref?: string; state?: string }> }) {
  const { ref, state } = await searchParams;
  const viewer = await getViewer();
  const data = await read();
  const tx = viewer ? data.transactions.find((t) => t.txRef === ref && t.userId === viewer.id) : undefined;
  const key = tx?.status ?? state ?? "pending";
  return (
    <div className="sn-stack" style={{ maxWidth: 640 }}>
      <PageHeader title="Payment not completed" />
      <Notice tone={key === "pending" ? "warn" : "danger"}>{COPY[key] ?? COPY.pending}</Notice>
      {tx ? <p className="sn-small">Reference <span className="sn-mono">{tx.txRef}</span></p> : null}
      <div className="sn-row">
        <Link className="kt-btn kt-btn--primary" href={tx ? `/subscribe/checkout?plan=${tx.planId}` : "/subscribe/listener"}>
          Try again
        </Link>
        <Link className="kt-btn kt-btn--ghost" href="/account/payment-history">
          Payment history
        </Link>
      </div>
    </div>
  );
}
