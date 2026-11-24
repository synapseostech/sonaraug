import Link from "next/link";
import { ResetPasswordForm } from "../forms.tsx";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; token_hash?: string }> }) {
  const { token, token_hash: tokenHash } = await searchParams;
  return (
    <div className="sn-auth__card">
      <h1>Choose a new password</h1>
      {token || tokenHash ? (
        <>
          <p className="sn-auth__lead">Choosing a new password signs you out on every device.</p>
          <ResetPasswordForm token={token} tokenHash={tokenHash} />
        </>
      ) : (
        <p className="sn-auth__lead">
          This page needs the link from your reset email. <Link className="sn-link" href="/auth/forgot-password">Request a new link</Link>.
        </p>
      )}
    </div>
  );
}
