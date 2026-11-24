import { requireViewer, safeNext } from "../../../lib/server/auth.ts";
import { CompleteProfileForm } from "../forms.tsx";

export const metadata = { title: "Complete your profile" };

export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const viewer = await requireViewer("/auth/complete-profile");
  return (
    <div className="sn-auth__card">
      <h1>A few details</h1>
      <p className="sn-auth__lead">This helps us show prices in the right currency and send receipts. Your profile is never public.</p>
      <CompleteProfileForm next={safeNext(next, "/medical-chronicles")} displayName={viewer.displayName} />
    </div>
  );
}
