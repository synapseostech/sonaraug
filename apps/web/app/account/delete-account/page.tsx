import { Notice, PageHeader, Panel } from "../../../components/sonara/ui.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { DeleteAccountForm } from "../forms.tsx";

export const metadata = { title: "Delete account" };

export default async function DeleteAccountPage() {
  await requireViewer("/account/delete-account");
  return (
    <>
      <PageHeader title="Delete your account" />
      <Notice tone="warn" title="What happens">
        You are signed out everywhere and your request is recorded. Your profile, listening history and saved items are erased when a staff member completes the
        request. Payment records are kept for as long as accounting law requires. Cancel any active subscription first if you do not want it to renew.
      </Notice>
      <Panel title="Request deletion" tone="danger">
        <DeleteAccountForm />
      </Panel>
    </>
  );
}
