import { z } from "zod";
import { publicUrlSchema, uuidSchema } from "./common.ts";

/** UGX amounts are whole shillings: no floats, no negative budgets. */
const ugxAmount = z.number().int("must be whole shillings").min(0).max(50_000_000_000);

export const campaignCreateSchema = z
  .object({
    advertiserId: uuidSchema,
    name: z.string().trim().min(2).max(160),
    objective: z.enum(["awareness", "consideration", "conversion"]),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    totalBudgetUgx: ugxAmount.min(10_000, "minimum campaign budget is UGX 10,000"),
    dailyBudgetUgx: ugxAmount.optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine((v) => v.dailyBudgetUgx === undefined || v.dailyBudgetUgx <= v.totalBudgetUgx, {
    message: "daily budget cannot exceed total budget",
    path: ["dailyBudgetUgx"],
  });

export const advertisementCreateSchema = z.object({
  campaignId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  kind: z.enum(["image", "audio", "video", "html"]),
  clickUrl: publicUrlSchema().optional(),
  durationSeconds: z.number().int().min(1).max(120).optional(),
});

export const placementKeySchema = z.enum([
  "home_hero",
  "home_rail",
  "radio_directory",
  "podcast_directory",
  "watch_feed",
  "player_companion",
]);

export const campaignPlacementSchema = z.object({
  campaignId: uuidSchema,
  placement: placementKeySchema,
  weight: z.number().int().min(1).max(100).default(10),
});

export const impressionSchema = z.object({
  campaignId: uuidSchema,
  advertisementId: uuidSchema,
  placement: placementKeySchema,
  /** Client-generated, used for de-duplication. */
  dedupeKey: z.string().min(16).max(128),
});
