"use client";

import Link from "next/link";
import { ActionForm, Checkbox, FormActions, PasswordField, SelectField, SubmitButton, TextField } from "../../components/sonara/forms.tsx";
import {
  completeProfileAction,
  confirmEmailAction,
  forgotPasswordAction,
  loginAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
} from "./actions.ts";

export function RegisterForm({ next }: { next: string }) {
  return (
    <ActionForm action={registerAction} aria-label="Create account">
      <input type="hidden" name="next" value={next} />
      <TextField name="displayName" label="Your name" autoComplete="name" required maxLength={80} />
      <TextField name="email" label="Email" type="email" autoComplete="email" inputMode="email" required />
      <PasswordField name="password" label="Password" autoComplete="new-password" hint="At least 10 characters. A short phrase is easier to remember." />
      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            I accept the <Link className="sn-link" href="/legal/terms" target="_blank">terms of use</Link> and have read the{" "}
            <Link className="sn-link" href="/legal/privacy" target="_blank">privacy notice</Link>.
          </>
        }
      />
      <Checkbox name="marketing" label="Send me occasional news about new Medical Chronicles series." hint="Optional. You can change this any time." />
      <FormActions>
        <SubmitButton pendingLabel="Creating account…">Create free account</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={loginAction} aria-label="Sign in">
      <input type="hidden" name="next" value={next} />
      <TextField name="email" label="Email" type="email" autoComplete="email" inputMode="email" required />
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      <FormActions>
        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
        <Link className="sn-link" href="/auth/forgot-password">
          Forgot your password?
        </Link>
      </FormActions>
    </ActionForm>
  );
}

export function ConfirmEmailForm({ token, tokenHash, type }: { token?: string; tokenHash?: string; type?: string }) {
  return (
    <ActionForm action={confirmEmailAction} aria-label="Confirm email">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      {tokenHash ? <input type="hidden" name="tokenHash" value={tokenHash} /> : null}
      <input type="hidden" name="type" value={type ?? "email"} />
      <FormActions>
        <SubmitButton pendingLabel="Confirming…">Confirm my email address</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ResendVerificationForm({ askEmail = false }: { askEmail?: boolean }) {
  return (
    <ActionForm action={resendVerificationAction} aria-label="Resend verification">
      {askEmail ? <TextField name="email" label="Email you registered with" type="email" autoComplete="email" required /> : null}
      <FormActions>
        <SubmitButton variant="secondary" pendingLabel="Sending…">Resend verification email</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  return (
    <ActionForm action={forgotPasswordAction} aria-label="Request password reset" resetOnSuccess>
      <TextField name="email" label="Email" type="email" autoComplete="email" required />
      <FormActions>
        <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ResetPasswordForm({ token, tokenHash }: { token?: string; tokenHash?: string }) {
  return (
    <ActionForm action={resetPasswordAction} aria-label="Choose a new password">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      {tokenHash ? <input type="hidden" name="tokenHash" value={tokenHash} /> : null}
      <PasswordField name="password" label="New password" autoComplete="new-password" hint="At least 10 characters." />
      <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />
      <FormActions>
        <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

const COUNTRIES = [
  { value: "UG", label: "Uganda" },
  { value: "KE", label: "Kenya" },
  { value: "TZ", label: "Tanzania" },
  { value: "RW", label: "Rwanda" },
  { value: "SS", label: "South Sudan" },
  { value: "CD", label: "DR Congo" },
  { value: "BI", label: "Burundi" },
  { value: "XX", label: "Other" },
];

export function CompleteProfileForm({ next, displayName }: { next: string; displayName: string }) {
  return (
    <ActionForm action={completeProfileAction} aria-label="Complete profile">
      <input type="hidden" name="next" value={next} />
      <TextField name="displayName" label="Display name" defaultValue={displayName} required />
      <SelectField name="country" label="Country" options={COUNTRIES} defaultValue="UG" />
      <TextField name="phone" label="Mobile number" type="tel" autoComplete="tel" optionalLabel hint="Used only for payment receipts and account recovery. Never shown publicly." />
      <FormActions>
        <SubmitButton>Save and continue</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
