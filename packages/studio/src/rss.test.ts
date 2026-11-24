import assert from "node:assert/strict";
import test from "node:test";
import { buildRssPreview, escapeXml, feedWarnings, formatDuration, type RssFeedSettings } from "./rss.ts";
import type { Episode } from "./types.ts";

const settings: RssFeedSettings = {
  title: "Kampala Conversations",
  description: "Long-form conversations with people shaping Kampala.",
  author: "Aisha Namutebi",
  language: "en-UG",
  categories: ["Society & Culture"],
  explicit: false,
  publicUrl: null,
  coverImageUrl: "https://example.test/cover.jpg",
};

function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "ep-1",
    showId: "show-1",
    seasonNumber: 1,
    number: 2,
    title: "Boda economics",
    description: "What a boda stage tells you about the city's cash flow.",
    audioSource: "recording",
    mediaAssetId: "asset-1",
    durationSeconds: 1854,
    explicit: false,
    rights: "original",
    publicationStatus: "published",
    reviewStatus: "approved",
    scheduledFor: null,
    publishedAt: "2026-11-10T06:00:00.000Z",
    createdAt: "2026-11-01T06:00:00.000Z",
    updatedAt: "2026-11-10T06:00:00.000Z",
    reviewNote: null,
    history: [],
    ...overrides,
  };
}

test("xml special characters are escaped so a title cannot break the feed", () => {
  assert.equal(escapeXml(`Tom & Jerry's "best" <show>`), "Tom &amp; Jerry&apos;s &quot;best&quot; &lt;show&gt;");
});

test("durations render the way podcast apps expect", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(1854), "30:54");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(0), "00:00");
});

test("the preview is valid RSS with the channel metadata", () => {
  const preview = buildRssPreview(settings, [episode()]);
  assert.match(preview.xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(preview.xml, /<rss version="2\.0"/);
  assert.match(preview.xml, /<title>Kampala Conversations<\/title>/);
  assert.match(preview.xml, /<itunes:author>Aisha Namutebi<\/itunes:author>/);
  assert.equal(preview.itemCount, 1);
});

test("episodes without audio never appear as broken enclosures", () => {
  const preview = buildRssPreview(settings, [episode(), episode({ id: "ep-2", title: "Unrecorded", audioSource: "none" })]);
  assert.equal(preview.itemCount, 1);
  assert.ok(!preview.xml.includes("Unrecorded"));
});

test("no enclosure URL is invented when hosting is absent", () => {
  const preview = buildRssPreview(settings, [episode()]);
  assert.ok(!/<enclosure /.test(preview.xml));
  assert.match(preview.xml, /hosting not configured/);
  assert.equal(preview.publicUrl, null);
});

test("an enclosure appears only once a public URL exists", () => {
  const preview = buildRssPreview({ ...settings, publicUrl: "https://feeds.example.test/show" }, [episode()]);
  assert.match(preview.xml, /<enclosure url="https:\/\/feeds\.example\.test\/show\/episodes\/ep-1\.mp3"/);
  assert.match(preview.xml, /type="audio\/mpeg"/);
});

test("feed warnings describe every missing requirement", () => {
  const warnings = feedWarnings(
    { ...settings, title: "x", description: "short", categories: [], coverImageUrl: null, language: "" },
    [],
  );
  assert.ok(warnings.length >= 5);
  assert.ok(warnings.some((w) => /title/i.test(w)));
  assert.ok(warnings.some((w) => /language/i.test(w)));
  assert.ok(warnings.some((w) => /no public feed URL/i.test(w)));
});

test("a complete feed with hosting produces no warnings", () => {
  const warnings = feedWarnings({ ...settings, publicUrl: "https://feeds.example.test/show" }, [episode()]);
  assert.deepEqual(warnings, []);
});

test("seasons and episode numbers order the feed", () => {
  const preview = buildRssPreview(settings, [
    episode({ id: "s2e1", seasonNumber: 2, number: 1, title: "Season two opener" }),
    episode({ id: "s1e1", seasonNumber: 1, number: 1, title: "Season one opener" }),
  ]);
  assert.ok(preview.xml.indexOf("Season one opener") < preview.xml.indexOf("Season two opener"));
});
