"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "../../components/sonara/forms.tsx";
import { guard } from "../../lib/server/actions-util.ts";
import { getViewer, safeNext } from "../../lib/server/auth.ts";
import { cancelMySubscription, requestRefund, resumeMySubscription, startCheckout } from "../../lib/server/billing.ts";

export async function startCheckoutAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await getViewer();
    if (!viewer) redirect(`/auth/login?next=${encodeURIComponent(`/subscribe/checkout?plan=${String(formData.get("planId") ?? "")}`)}`);
    if (formData.get("acceptTerms") !== "on") return { ok: false, message: "Please accept the subscription terms.", fieldErrors: { acceptTerms: "Required." } };
    const renewal = formData.get("renewal") === "card_auto" ? "card_auto" : "manual";
    const result = await startCheckout(viewer, { planId: String(formData.get("planId") ?? ""), promoCode: String(formData.get("promoCode") ?? ""), renewal });
    if (!result.ok) return { ok: false, message: result.message };
    redirect(result.redirectTo);
  });
}

function back(formData: FormData, notice: string): never {
  const base = safeNext(String(formData.get("returnTo") ?? ""), "/account/subscriptions").split("?")[0];
  redirect(`${base}?notice=${notice}`);
}

export async function cancelSubscriptionAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await getViewer();
    if (!viewer) redirect("/auth/login?next=/subscribe/manage");
    const result = await cancelMySubscription(viewer, String(formData.get("subscriptionId") ?? ""));
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/account/subscriptions");
    back(formData, result.message.includes("could not confirm") ? "cancelled_unconfirmed" : "cancelled");
  });
}

export async function resumeSubscriptionAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await getViewer();
    if (!viewer) redirect("/auth/login?next=/subscribe/manage");
    const result = await resumeMySubscription(viewer, String(formData.get("subscriptionId") ?? ""));
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/account/subscriptions");
    back(formData, "resumed");
  });
}

export async function requestRefundAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await getViewer();
    if (!viewer) redirect("/auth/login?next=/account/payment-history");
    const result = await requestRefund(viewer, String(formData.get("transactionId") ?? ""), String(formData.get("reason") ?? ""));
    revalidatePath("/account/payment-history");
    return { ok: result.ok, message: result.message };
  });
}
