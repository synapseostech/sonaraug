/** Helpers shared by server actions: form parsing and uniform error handling. */
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodTypeAny, type z } from "zod";
import type { FormState } from "../../components/sonara/forms.tsx";
import { AccessError } from "./auth.ts";
import { CommandError } from "./chronicles.ts";

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !/password/i.test(key)) values[key] = value;
  }
  return values;
}

export function parseForm<S extends ZodTypeAny>(schema: S, formData: FormData): z.infer<S> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key in raw) raw[key] = ([] as unknown[]).concat(raw[key], value);
    else raw[key] = value;
  }
  return schema.parse(raw);
}

/** Runs an action body and converts known failures into a FormState. Redirects pass through. */
export async function guard(formData: FormData, body: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await body()) ?? { ok: true };
  } catch (error) {
    // Lets Next.js redirect()/notFound() propagate.
    unstable_rethrow(error);
    const values = formValues(formData);
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = String(issue.path[0] ?? "form");
        fieldErrors[key] ??= issue.message;
      }
      return { ok: false, message: "Please correct the highlighted fields.", fieldErrors, values };
    }
    if (error instanceof CommandError) {
      return { ok: false, message: error.message, fieldErrors: error.field ? { [error.field]: error.message } : undefined, values };
    }
    if (error instanceof AccessError) return { ok: false, message: "You do not have permission to do that.", values };
    console.error("[action] unexpected failure:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Something went wrong. Nothing was saved. Please try again.", values };
  }
}
