import Link from "next/link";

export const metadata = { title: "Sign-in provider" };

/**
 * Reserved for OAuth providers (Google sign-in is planned). No external
 * provider is configured in this build, so nothing is exchanged here.
 */
export default function AuthCallbackPage() {
  return (
    <div className="sn-auth__card">
      <h1>External sign-in is not enabled</h1>
      <p className="sn-auth__lead">
        Sonara currently supports email and password accounts. Google sign-in is planned and will use this address once it is configured with the dedicated Sonara
        identity project.
      </p>
      <Link className="kt-btn kt-btn--primary" href="/auth/login">
        Sign in with email
      </Link>
    </div>
  );
}
