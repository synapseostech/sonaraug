import Link from "next/link";
import { Notice } from "../../../components/sonara/ui.tsx";
import { authCapabilities, getViewer, safeNext } from "../../../lib/server/auth.ts";
import { emailProvider } from "../../../lib/server/notify.ts";
import { ConfirmEmailForm, ResendVerificationForm } from "../forms.tsx";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; token_hash?: string; type?: string; sent?: string; next?: string }> }) {
  const { token, token_hash: tokenHash, type, sent, next } = await searchParams;
  const viewer = await getViewer();
  const caps = authCapabilities();
  const devOutbox = caps.authEmails === "dev_outbox" && emailProvider() === "dev_outbox";

  if (token || tokenHash) {
    return (
      <div className="sn-auth__card">
        <h1>Confirm your email</h1>
        <p className="sn-auth__lead">Press the button to finish verifying your address. (We ask you to press it so that email scanners cannot use your link.)</p>
        <ConfirmEmailForm token={token} tokenHash={tokenHash} type={type === "email_change" ? "email_change" : "email"} />
        <div className="sn-auth__foot">
          <Link className="sn-link" href="/account">
            Go to your account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sn-auth__card">
      <h1>{viewer?.emailVerified ? "Email verified" : "Check your inbox"}</h1>
      {viewer?.emailVerified ? (
        <p className="sn-auth__lead">Your email address is verified.</p>
      ) : (
        <p className="sn-auth__lead">
          {sent ? "Your account is ready. " : ""}We sent a verification link to {viewer?.email ?? "your email address"}.{" "}
          {caps.signInRequiresVerifiedEmail
            ? "Confirm it to sign in. Free episodes are open to everyone in the meantime."
            : "You can listen to free episodes now; verifying is needed before you subscribe or apply as a creator."}
        </p>
      )}
      {devOutbox ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title="Development build">
            Email is not sent from this build. Open the <Link className="sn-link" href="/dev/outbox">development outbox</Link> to follow the link.
          </Notice>
        </div>
      ) : null}
      {viewer && !viewer.emailVerified ? <ResendVerificationForm /> : null}
      {!viewer && caps.signInRequiresVerifiedEmail ? (
        <>
          <p className="sn-auth__lead">You can sign in once your address is confirmed. Lost the email?</p>
          <ResendVerificationForm askEmail />
        </>
      ) : null}
      <div className="sn-auth__foot">
        <Link className="sn-link" href={safeNext(next, "/medical-chronicles")}>
          Continue
        </Link>
      </div>
    </div>
  );
}
