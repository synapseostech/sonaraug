/**
 * Single source of truth for brand identity.
 *
 * RULE: no user-facing brand string may be hardcoded anywhere else in the
 * codebase. Store listings, emails, legal pages and metadata all read from
 * here. The default codename is intentional and temporary (ADR-0002); the
 * commercial name is not final.
 */

export type Brand = {
  /** Short display name used in UI chrome. */
  readonly name: string;
  /** Legal entity used on legal pages and invoices. Empty until incorporated. */
  readonly legalEntity: string;
  readonly tagline: string;
  /** Product codename used for package scope, storage prefixes, etc. */
  readonly codename: string;
  /** Accent colour. Placeholder pending brand development (see ADR-0004). */
  readonly accent: string;
  readonly supportEmail: string;
  readonly marketingSite: string;
  /** Locale defaults for the launch market. */
  readonly defaultLocale: string;
  readonly defaultCountry: string;
  readonly timezone: string;
  /** ISO 4217 currency for all monetary amounts. */
  readonly currency: string;
  /** Minor units per major unit (UGX has 0; stored as bigint minor units). */
  readonly currencyExponent: number;
};

const env = (key: string): string | undefined => {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export const brand: Brand = Object.freeze({
  name: env("NEXT_PUBLIC_BRAND_NAME") ?? "Sonara",
  legalEntity: env("BRAND_LEGAL_ENTITY") ?? "",
  tagline: env("NEXT_PUBLIC_BRAND_TAGLINE") ?? "Radio, podcasts, Medical Chronicles and video for Uganda",
  codename: "kito",
  accent: env("NEXT_PUBLIC_BRAND_ACCENT") ?? "#F5A524",
  supportEmail: env("BRAND_SUPPORT_EMAIL") ?? "support@example.invalid",
  marketingSite: env("NEXT_PUBLIC_MARKETING_SITE") ?? "https://example.invalid",
  defaultLocale: env("BRAND_DEFAULT_LOCALE") ?? "en-UG",
  defaultCountry: "UG",
  timezone: "Africa/Kampala",
  currency: "UGX",
  currencyExponent: 0,
});

/** True when the deployment is still using placeholder identity. */
export const isPlaceholderBrand = (): boolean => brand.supportEmail.endsWith(".invalid");
