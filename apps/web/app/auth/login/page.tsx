import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "../../../components/sonara/ui.tsx";
import { getViewer, safeNext } from "../../../lib/server/auth.ts";
import { LoginForm } from "../forms.tsx";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  return (
    <div className="sn-auth__card">
      <h1>Sign in</h1>
      <p className="sn-auth__lead">Welcome back to Sonara.</p>
      {reset ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="ok">Your password was changed and every device was signed out. Sign in with your new password.</Notice>
        </div>
      ) : null}
      <LoginForm next={safeNext(next)} />
      <div className="sn-auth__foot">
        <span>
          New to Sonara?{" "}
          <Link className="sn-link" href={`/auth/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            Create a free account
          </Link>
        </span>
      </div>
    </div>
  );
}
