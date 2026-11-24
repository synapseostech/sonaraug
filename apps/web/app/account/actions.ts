"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "../../components/sonara/forms.tsx";
import { guard } from "../../lib/server/actions-util.ts";
import { changePassword, getViewer, logout, revokeSession, type Viewer } from "../../lib/server/auth.ts";
import { OPTIONAL_KINDS } from "../../lib/server/notify.ts";
import { markNotificationsRead, requestAccountDeletion, updateEmailPreferences, updateOwnProfile, updatePreferences } from "../../lib/server/users.ts";

async function me(path: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/login?next=${encodeURIComponent(path)}`);
  return viewer;
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  bio: z.string().max(600, "Keep it under 600 characters.").default(""),
  phone: z.string().max(20).default(""),
  country: z.string().regex(/^[A-Z]{2}$/, "Choose a country."),
});

export async function saveProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/profile");
    const input = profileSchema.parse(Object.fromEntries(formData));
    await updateOwnProfile(viewer, { ...input, locale: "en-UG" });
    revalidatePath("/account", "layout");
    return { ok: true, message: "Profile saved." };
  });
}

export async function changePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/security");
    const next = String(formData.get("next") ?? "");
    if (next !== String(formData.get("confirm") ?? "")) return { ok: false, message: "The new passwords do not match.", fieldErrors: { confirm: "Does not match." } };
    const result = await changePassword(viewer, String(formData.get("current") ?? ""), next);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.field ? { [result.field]: result.message } : undefined };
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  });
}

export async function revokeSessionAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/devices");
    const target = String(formData.get("sessionId") ?? "");
    if (target === viewer.sessionId) {
      await logout();
      redirect("/auth/login");
    }
    await revokeSession(viewer, target === "others" ? "others" : target);
    revalidatePath("/account/devices");
    return { ok: true, message: target === "others" ? "Signed out of all other devices." : "Device signed out." };
  });
}

export async function savePreferencesAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/preferences");
    await updatePreferences(viewer, {
      playbackSpeed: Number(formData.get("playbackSpeed") ?? 1),
      autoplayNext: formData.get("autoplayNext") === "on",
      dataSaver: formData.get("dataSaver") === "on",
      marketing: formData.get("marketing") === "on",
    });
    return { ok: true, message: "Preferences saved." };
  });
}

export async function saveEmailPreferencesAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/notifications");
    const prefs = Object.fromEntries(OPTIONAL_KINDS.map((kind) => [kind, formData.get(`email_${kind}`) === "on"]));
    await updateEmailPreferences(viewer, prefs);
    return { ok: true, message: "Notification preferences saved." };
  });
}

export async function markAllReadAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/notifications");
    await markNotificationsRead(viewer);
    revalidatePath("/account/notifications");
    return { ok: true, message: "All notifications marked as read." };
  });
}

export async function deleteAccountAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await me("/account/delete-account");
    await requestAccountDeletion(viewer, String(formData.get("confirmEmail") ?? ""));
    await logout();
    redirect("/?deleted=1");
  });
}

export async function signOutAction(): Promise<void> {
  await logout();
  redirect("/");
}
