import Link from "next/link";
import { Notice } from "../../../components/sonara/ui.tsx";
import { emailProvider } from "../../../lib/server/notify.ts";
import { ForgotPasswordForm } from "../forms.tsx";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="sn-auth__card">
      <h1>Reset your password</h1>
      <p className="sn-auth__lead">Enter the email you registered with. If it has an account, we will send a reset link.</p>
      {emailProvider() === "dev_outbox" ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title="Development build">
            Reset emails appear in the <Link className="sn-link" href="/dev/outbox">development outbox</Link>.
          </Notice>
        </div>
      ) : null}
      <ForgotPasswordForm />
      <div className="sn-auth__foot">
        <Link className="sn-link" href="/auth/login">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
