/**
 * Feature flags. Defaults are deliberately the safe/production-off value so a
 * missing environment never silently enables a commercial surface.
 */

export type FeatureFlags = {
  readonly downloads: boolean;
  readonly comments: boolean;
  readonly advertising: boolean;
  readonly dataSaverDefault: boolean;
};

const flag = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
};

export function resolveFeatureFlags(source: Record<string, string | undefined> = process.env): FeatureFlags {
  return Object.freeze({
    downloads: flag(source.FF_ENABLE_DOWNLOADS, false),
    comments: flag(source.FF_ENABLE_COMMENTS, true),
    advertising: flag(source.FF_ENABLE_ADVERTISING, false),
    dataSaverDefault: flag(source.DATA_SAVER_DEFAULT, true),
  });
}

export const features: FeatureFlags = resolveFeatureFlags();
