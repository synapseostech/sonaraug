import { test } from "node:test";
import assert from "node:assert/strict";
import { organisationCreateSchema, scheduleSlotSchema, stationCreateSchema } from "./catalogue.ts";
import { commentCreateSchema, contentReportSchema } from "./publishing.ts";

const UUID = "6f1c2a9e-0f0a-4f5f-9d1e-3b0b8f1a2c3d";

const validStation = {
  orgId: UUID,
  name: "Kampala FM",
  slug: "kampala-fm",
  categoryId: "music",
  regionCode: "central" as const,
  languageCodes: ["lg", "en"],
};

test("a minimal station is valid", () => {
  assert.equal(stationCreateSchema.safeParse(validStation).success, true);
});

test("station slugs cannot contain uppercase, spaces or leading hyphens", () => {
  for (const slug of ["Kampala-FM", "kampala fm", "-kampala", "kampala--fm-", "a"]) {
    assert.equal(stationCreateSchema.safeParse({ ...validStation, slug }).success, false, slug);
  }
});

test("a station must declare at least one language", () => {
  assert.equal(stationCreateSchema.safeParse({ ...validStation, languageCodes: [] }).success, false);
});

test("frequency text is display-only but must look like a frequency", () => {
  assert.equal(stationCreateSchema.safeParse({ ...validStation, frequencyText: "94.8 FM" }).success, true);
  assert.equal(stationCreateSchema.safeParse({ ...validStation, frequencyText: "ninety four" }).success, false);
});

test("organisation type is restricted to the four supported kinds", () => {
  const base = {
    legalName: "Kampala Broadcasting Ltd",
    slug: "kampala-broadcasting",
    orgType: "broadcaster" as const,
    contactEmail: "ops@example.co.ug",
  };
  assert.equal(organisationCreateSchema.safeParse(base).success, true);
  assert.equal(organisationCreateSchema.safeParse({ ...base, orgType: "record_label" }).success, false);
});

test("schedule slots reject inverted or malformed times", () => {
  const base = { stationId: UUID, dayOfWeek: 1, startTime: "09:00", endTime: "11:00" };
  assert.equal(scheduleSlotSchema.safeParse(base).success, true);
  assert.equal(scheduleSlotSchema.safeParse({ ...base, endTime: "08:00" }).success, false);
  assert.equal(scheduleSlotSchema.safeParse({ ...base, startTime: "9:00" }).success, false);
  assert.equal(scheduleSlotSchema.safeParse({ ...base, startTime: "24:00" }).success, false);
  assert.equal(scheduleSlotSchema.safeParse({ ...base, dayOfWeek: 7 }).success, false);
});

test("a comment must target exactly one piece of content", () => {
  assert.equal(commentCreateSchema.safeParse({ body: "Great show", videoId: UUID }).success, true);
  assert.equal(commentCreateSchema.safeParse({ body: "Great show" }).success, false);
  assert.equal(commentCreateSchema.safeParse({ body: "", videoId: UUID }).success, false);
});

test("reports require a known reason and a known target type", () => {
  assert.equal(contentReportSchema.safeParse({ reason: "copyright", targetType: "video", targetId: UUID }).success, true);
  assert.equal(contentReportSchema.safeParse({ reason: "because", targetType: "video", targetId: UUID }).success, false);
  assert.equal(contentReportSchema.safeParse({ reason: "spam", targetType: "user", targetId: UUID }).success, false);
});
