import { PageHeader, Notice } from "../../../components/sonara/ui.tsx";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Privacy notice (draft)" };

export default async function PrivacyPage() {
  const { settings } = await read();
  return (
    <div className="sn-stack">
      <PageHeader eyebrow={`Version ${settings.privacyVersion}`} title="Privacy notice" />
      <Notice tone="warn" title="Draft — requires review under Uganda's Data Protection and Privacy Act, 2019">
        This notice is a development placeholder. Registration with the Personal Data Protection Office, the lawful bases, retention periods and cross-border
        transfer arrangements must be confirmed by a qualified adviser before launch.
      </Notice>
      <div className="sn-prose">
        <p>We collect your name, email, optional phone number, country, listening history, saved episodes and payment records. Card and mobile-money details are handled by Flutterwave; Sonara never receives or stores card numbers or PINs.</p>
        <p>You can download a copy of your data and request deletion from your account. Payment records may be retained where the law requires it.</p>
      </div>
    </div>
  );
}
