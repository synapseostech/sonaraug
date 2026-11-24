import { PageHeader } from "../../../components/sonara/ui.tsx";
import { currentUserRecord, requireViewer } from "../../../lib/server/auth.ts";
import { ProfileForm } from "../forms.tsx";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer("/account/profile");
  const user = await currentUserRecord(viewer);
  if (!user) return null;
  return (
    <>
      <PageHeader title="Profile" description="Your profile is private. Nothing here is shown publicly." />
      <ProfileForm user={{ displayName: user.displayName, bio: user.bio, phone: user.phone, country: user.country, email: user.email }} />
    </>
  );
}
