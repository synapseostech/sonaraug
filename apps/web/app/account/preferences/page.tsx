import { PageHeader } from "../../../components/sonara/ui.tsx";
import { currentUserRecord, requireViewer } from "../../../lib/server/auth.ts";
import { PreferencesForm } from "../forms.tsx";

export const metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const viewer = await requireViewer("/account/preferences");
  const user = await currentUserRecord(viewer);
  if (!user) return null;
  return (
    <>
      <PageHeader title="Preferences" />
      <PreferencesForm prefs={user.preferences} marketing={user.marketingConsent} />
    </>
  );
}
