import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, safeNext } from "../../../lib/server/auth.ts";
import { RegisterForm } from "../forms.tsx";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  return (
    <div className="sn-auth__card">
      <h1>Create your free account</h1>
      <p className="sn-auth__lead">Listen to free Medical Chronicles episodes, keep your listening history and subscribe when you are ready.</p>
      <RegisterForm next={safeNext(next, "/medical-chronicles")} />
      <div className="sn-auth__foot">
        <span>
          Already have an account?{" "}
          <Link className="sn-link" href={`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            Sign in
          </Link>
        </span>
        <span>Google sign-in is planned but not enabled in this build.</span>
      </div>
    </div>
  );
}
