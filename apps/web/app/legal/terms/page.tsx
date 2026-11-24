import { PageHeader, Notice } from "../../../components/sonara/ui.tsx";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Terms of use (draft)" };

export default async function TermsPage() {
  const { settings } = await read();
  return (
    <div className="sn-stack">
      <PageHeader eyebrow={`Version ${settings.termsVersion}`} title="Terms of use" />
      <Notice tone="warn" title="Draft — not legal advice and not yet reviewed">
        These terms are a placeholder for the development build. Final terms must be prepared and reviewed by a qualified Ugandan lawyer before launch
        (consumer protection, electronic transactions, subscriptions and refunds, and creator content licensing).
      </Notice>
      <div className="sn-prose">
        <p>Sonara provides radio, podcasts, Medical Chronicles and video. Free accounts can listen to free content. Paid listener subscriptions unlock premium episodes for the paid period; creator plans are a separate product.</p>
        <p>Medical Chronicles is educational content. It is not medical advice and does not replace professional clinical judgement.</p>
        <p>Subscriptions renew only where you choose automatic card renewal; otherwise you renew each period yourself. You can cancel at any time and keep access until the end of the period you paid for.</p>
      </div>
    </div>
  );
}
