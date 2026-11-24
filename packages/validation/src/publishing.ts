import { z } from "zod";
import { descriptionSchema, publicUrlSchema, slugSchema, uuidSchema } from "./common.ts";

export const podcastCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  slug: slugSchema,
  description: descriptionSchema,
  categoryId: z.string().trim().min(2).max(40),
  languageCode: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  explicit: z.boolean().default(false),
  downloadAllowed: z.boolean().default(true),
});

export const episodeCreateSchema = z.object({
  podcastId: uuidSchema,
  title: z.string().trim().min(2).max(200),
  guid: z.string().trim().min(1).max(512),
  summary: z.string().trim().max(400).optional(),
  description: descriptionSchema,
  durationSeconds: z.number().int().min(0).max(60 * 60 * 12).optional(),
  episodeNumber: z.number().int().min(0).max(100_000).optional(),
  seasonNumber: z.number().int().min(0).max(1_000).optional(),
  publishedAt: z.coerce.date().optional(),
  explicit: z.boolean().default(false),
});

export const rssFeedSchema = z.object({
  podcastId: uuidSchema,
  feedUrl: publicUrlSchema(),
});

export const videoCreateSchema = z.object({
  channelId: uuidSchema,
  title: z.string().trim().min(2).max(200),
  slug: slugSchema,
  description: descriptionSchema,
  categoryId: z.string().trim().min(2).max(40),
  languageCode: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  allowComments: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
});

export const captionCreateSchema = z.object({
  videoId: uuidSchema,
  languageCode: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  kind: z.enum(["subtitles", "captions", "forced"]).default("subtitles"),
  label: z.string().trim().max(60).optional(),
});

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1, "cannot be empty").max(2_000, "is too long"),
  parentId: uuidSchema.optional(),
}).and(
  z.union([
    z.object({ videoId: uuidSchema }),
    z.object({ episodeId: uuidSchema }),
    z.object({ stationId: uuidSchema }),
  ]),
);

export const contentReportSchema = z.object({
  reason: z.enum(["copyright", "harassment", "hate", "sexual", "violence", "spam", "misinformation", "other"]),
  details: z.string().trim().max(2_000).optional(),
  targetType: z.enum(["video", "episode", "station", "comment", "channel"]),
  targetId: uuidSchema,
});

export const playbackProgressSchema = z.object({
  positionSeconds: z.number().min(0).max(60 * 60 * 12),
  durationSeconds: z.number().min(0).max(60 * 60 * 12).optional(),
  completed: z.boolean().default(false),
});
