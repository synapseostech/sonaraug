"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "../../components/sonara/forms.tsx";
import { guard, formValues } from "../../lib/server/actions-util.ts";
import {
  getViewer,
  loginUser,
  logout,
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  safeNext,
  verifyEmail,
} from "../../lib/server/auth.ts";
import { updateOwnProfile } from "../../lib/server/users.ts";

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const result = await registerUser({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      acceptTerms: formData.get("acceptTerms") === "on",
      marketing: formData.get("marketing") === "on",
    });
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.field ? { [result.field]: result.message } : undefined, values: formValues(formData) };
    redirect(`/auth/verify-email?sent=1&next=${encodeURIComponent(safeNext(String(formData.get("next") ?? ""), "/medical-chronicles"))}`);
  });
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const result = await loginUser({ email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") });
    if (!result.ok) return { ok: false, message: result.message, values: formValues(formData) };
    const next = safeNext(String(formData.get("next") ?? ""));
    const viewer = await getViewer();
    if (viewer && !viewer.profileComplete) redirect(`/auth/complete-profile?next=${encodeURIComponent(next)}`);
    redirect(next);
  });
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/");
}

export async function confirmEmailAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const token = String(formData.get("token") ?? "") || undefined;
    const tokenHash = String(formData.get("tokenHash") ?? "") || undefined;
    if ((!token && !tokenHash) || (token ?? tokenHash ?? "").length > 200) return { ok: false, message: "This verification link is incomplete." };
    const result = await verifyEmail({ token, tokenHash, type: String(formData.get("type") ?? "email") });
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, message: "Your email is verified. You can now subscribe and apply as a creator." };
  });
}

export async function resendVerificationAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await getViewer();
    if (viewer?.emailVerified) return { ok: true, message: "Your email is already verified." };
    if (viewer) {
      await resendVerification({ userId: viewer.id }, viewer.email);
      return { ok: true, message: `We sent a new verification link to ${viewer.email}.` };
    }
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return { ok: false, message: "Enter the email address you registered with.", fieldErrors: { email: "Required." } };
    await resendVerification({ email });
    // Same answer whether or not the address has an account.
    return { ok: true, message: "If that address has an unconfirmed account, we have sent a new link." };
  });
}

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const email = z.string().trim().email("Enter a valid email address.").parse(formData.get("email"));
    await requestPasswordReset(email);
    // Same answer whether or not the account exists.
    return { ok: true, message: "If an account exists for that address, we have sent a link to reset the password. It expires in one hour." };
  });
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const password = String(formData.get("password") ?? "");
    if (password !== String(formData.get("confirm") ?? "")) return { ok: false, message: "The passwords do not match.", fieldErrors: { confirm: "The passwords do not match." } };
    const result = await resetPassword({ token: String(formData.get("token") ?? "") || undefined, tokenHash: String(formData.get("tokenHash") ?? "") || undefined }, password);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.field ? { [result.field]: result.message } : undefined };
    redirect("/auth/login?reset=1");
  });
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  country: z.string().regex(/^[A-Z]{2}$/, "Choose a country."),
  phone: z.string().max(20).optional().default(""),
  next: z.string().optional(),
});

export async function completeProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await getViewer();
    if (!viewer) redirect("/auth/login");
    const input = profileSchema.parse(Object.fromEntries(formData));
    await updateOwnProfile(viewer, { displayName: input.displayName, bio: "", phone: input.phone, country: input.country, locale: "en-UG", complete: true });
    redirect(safeNext(input.next, "/medical-chronicles"));
  });
}
