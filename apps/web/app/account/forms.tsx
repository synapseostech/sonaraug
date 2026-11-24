"use client";

import { ActionForm, Checkbox, FormActions, PasswordField, SelectField, SubmitButton, TextArea, TextField } from "../../components/sonara/forms.tsx";
import { changePasswordAction, deleteAccountAction, saveEmailPreferencesAction, savePreferencesAction, saveProfileAction } from "./actions.ts";

const COUNTRIES = [
  ["UG", "Uganda"], ["KE", "Kenya"], ["TZ", "Tanzania"], ["RW", "Rwanda"], ["SS", "South Sudan"], ["CD", "DR Congo"], ["BI", "Burundi"], ["XX", "Other"],
].map(([value, label]) => ({ value: value!, label: label! }));

export function ProfileForm({ user }: { user: { displayName: string; bio: string; phone: string | null; country: string; email: string } }) {
  return (
    <ActionForm action={saveProfileAction} aria-label="Profile">
      <TextField name="displayName" label="Display name" defaultValue={user.displayName} required />
      <TextField name="email" label="Email" defaultValue={user.email} disabled hint="Changing your email address is not available yet. Contact support." />
      <TextArea name="bio" label="About you" defaultValue={user.bio} optionalLabel maxLength={600} />
      <TextField name="phone" label="Mobile number" type="tel" defaultValue={user.phone ?? ""} optionalLabel hint="For receipts and account recovery. Never public." />
      <SelectField name="country" label="Country" options={COUNTRIES} defaultValue={user.country} />
      <FormActions>
        <SubmitButton>Save profile</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} aria-label="Change password" resetOnSuccess>
      <PasswordField name="current" label="Current password" autoComplete="current-password" />
      <PasswordField name="next" label="New password" autoComplete="new-password" hint="At least 10 characters." />
      <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />
      <FormActions>
        <SubmitButton>Change password</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function PreferencesForm({ prefs, marketing }: { prefs: { playbackSpeed: number; autoplayNext: boolean; dataSaver: boolean }; marketing: boolean }) {
  return (
    <ActionForm action={savePreferencesAction} aria-label="Preferences">
      <SelectField name="playbackSpeed" label="Default playback speed" defaultValue={String(prefs.playbackSpeed)} options={["0.75", "1", "1.25", "1.5", "2"].map((v) => ({ value: v, label: `${v}×` }))} />
      <Checkbox name="autoplayNext" label="Play the next episode in a series automatically" defaultChecked={prefs.autoplayNext} />
      <Checkbox name="dataSaver" label="Data saver" hint="Prefer lower-bitrate audio when a choice exists." defaultChecked={prefs.dataSaver} />
      <Checkbox name="marketing" label="News about new series and features" defaultChecked={marketing} />
      <FormActions>
        <SubmitButton>Save preferences</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function EmailPreferencesForm({ kinds }: { kinds: { kind: string; label: string; enabled: boolean }[] }) {
  return (
    <ActionForm action={saveEmailPreferencesAction} aria-label="Email preferences">
      {kinds.map((k) => (
        <Checkbox key={k.kind} name={`email_${k.kind}`} label={k.label} defaultChecked={k.enabled} />
      ))}
      <FormActions>
        <SubmitButton>Save notification settings</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function DeleteAccountForm() {
  return (
    <ActionForm action={deleteAccountAction} aria-label="Delete account" confirm="Request deletion of your Sonara account? You will be signed out.">
      <TextField name="confirmEmail" label="Type your account email to confirm" type="email" autoComplete="off" required />
      <FormActions>
        <SubmitButton variant="danger" pendingLabel="Submitting…">
          Request account deletion
        </SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
