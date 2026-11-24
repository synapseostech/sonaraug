import { z } from "zod";
import { descriptionSchema, displayNameSchema, languageCodesSchema, publicUrlSchema, slugSchema, uuidSchema } from "./common.ts";

export const orgTypeSchema = z.enum(["broadcaster", "creator_network", "advertiser", "agency"]);

export const organisationCreateSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().min(2).max(200).optional(),
  slug: slugSchema,
  orgType: orgTypeSchema,
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().max(32).optional(),
  description: descriptionSchema,
});

export const orgMemberInviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "editor", "presenter", "analyst", "billing"]),
});

const UG_REGION = z.enum(["central", "eastern", "northern", "western"]);

export const stationCreateSchema = z.object({
  orgId: uuidSchema,
  name: z.string().trim().min(2, "is required").max(120),
  slug: slugSchema,
  tagline: z.string().trim().max(140).optional(),
  description: descriptionSchema,
  categoryId: z.string().trim().min(2).max(40),
  regionCode: UG_REGION,
  languageCodes: languageCodesSchema,
  frequencyText: z
    .string()
    .trim()
    .regex(/^\d{2,3}(?:\.\d)?\s?FM$/i, "use a format such as 94.8 FM")
    .optional(),
  websiteUrl: publicUrlSchema().optional(),
});

export const stationUpdateSchema = stationCreateSchema.partial().omit({ orgId: true });

export const streamProtocolSchema = z.enum(["icecast", "shoutcast", "hls", "https_mp3", "https_aac"]);

/**
 * Registering a stream endpoint is a server-side-probe target, so the URL is
 * restricted to public hosts (SSRF guard) and the scheme must match protocol.
 * Plain http is tolerated for legacy Icecast/Shoutcast origins only.
 */
export const streamEndpointCreateSchema = z
  .object({
    stationId: uuidSchema,
    label: z.string().trim().min(1).max(60).default("Main"),
    protocol: streamProtocolSchema,
    url: publicUrlSchema({ allowHttp: true }),
    backupOfStreamId: uuidSchema.optional(),
    codec: z.enum(["mp3", "aac", "aacp", "opus", "ogg", "hls"]).optional(),
    bitrateKbps: z.number().int().min(8).max(512).optional(),
  })
  .superRefine((value, ctx) => {
    const scheme = new URL(value.url).protocol;
    if (value.protocol === "hls" && scheme !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "HLS endpoints must use https" });
    }
    if (value.protocol === "https_mp3" && scheme !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "must use https" });
    }
  });

export const scheduleSlotSchema = z
  .object({
    stationId: uuidSchema,
    programmeId: uuidSchema.optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use 24-hour HH:MM"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use 24-hour HH:MM"),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().optional(),
  })
  .refine((v) => v.startTime < v.endTime, { message: "end time must be after start time", path: ["endTime"] })
  .refine((v) => v.effectiveTo === undefined || v.effectiveFrom === undefined || v.effectiveTo >= v.effectiveFrom, {
    message: "effectiveTo must not precede effectiveFrom",
    path: ["effectiveTo"],
  });

export const presenterCreateSchema = z.object({
  orgId: uuidSchema,
  displayName: displayNameSchema,
  bio: descriptionSchema,
  profileId: uuidSchema.optional(),
});
