/**
 * RSS publishing preview.
 *
 * This builds a real, valid RSS 2.0 document from the show's episodes so a
 * creator can see exactly what a hosting provider would receive. It does NOT
 * invent a public feed URL: `publicUrl` stays null until a hosting endpoint
 * actually exists, and the UI says so.
 */

import type { Show } from "./types.ts";
import type { Episode } from "./types.ts";

export type RssFeedSettings = {
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly language: string;
  readonly categories: readonly string[];
  readonly explicit: boolean;
  /** null until a hosting endpoint exists. Never fabricated. */
  readonly publicUrl: string | null;
  readonly coverImageUrl: string | null;
};

export type RssPreview = {
  readonly xml: string;
  readonly itemCount: number;
  /** Feed-level problems that would make a real submission fail. */
  readonly warnings: readonly string[];
  readonly publicUrl: string | null;
};

/** XML text escaping — required for titles with `&`, apostrophes and quotes. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

/** "m:ss" / "h:mm:ss" — matches what podcast apps show. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

export function feedWarnings(settings: RssFeedSettings, episodes: readonly Episode[]): readonly string[] {
  const warnings: string[] = [];
  if (settings.title.trim().length < 3) warnings.push("Feed title is too short.");
  if (settings.description.trim().length < 20) warnings.push("Feed description should be at least 20 characters.");
  if (!settings.language) warnings.push("Select a feed language.");
  if (settings.categories.length === 0) warnings.push("Add at least one category — Apple Podcasts requires it.");
  if (!settings.coverImageUrl) warnings.push("Add cover artwork; most directories reject feeds without it.");
  if (episodes.length === 0) warnings.push("The feed has no episodes yet.");
  if (settings.publicUrl === null) warnings.push("No public feed URL: hosting is not configured, so this feed cannot be submitted yet.");
  for (const episode of episodes) {
    if (episode.audioSource === "none") warnings.push(`“${episode.title}” has no audio attached.`);
    if (!episode.durationSeconds) warnings.push(`“${episode.title}” has no known duration.`);
  }
  return warnings;
}

/**
 * Build the RSS document. Episodes are included only when they have audio, so
 * the preview never shows a broken enclosure.
 */
export function buildRssPreview(settings: RssFeedSettings, episodes: readonly Episode[]): RssPreview {
  const items = episodes
    .filter((episode) => episode.audioSource !== "none")
    .sort((a, b) => (a.seasonNumber - b.seasonNumber) || (a.number - b.number));

  const itemsXml = items
    .map((episode) => {
      const duration = episode.durationSeconds ?? 0;
      const guid = `kito:episode:${episode.id}`;
      const encodedSize = duration > 0 ? Math.round((duration * 128_000) / 8) : 0;
      return [
        "    <item>",
        `      <title>${escapeXml(episode.title)}</title>`,
        `      <description>${escapeXml(episode.description)}</description>`,
        `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `      <pubDate>${rfc822(episode.publishedAt ?? episode.createdAt)}</pubDate>`,
        `      <itunes:duration>${formatDuration(duration)}</itunes:duration>`,
        `      <itunes:season>${episode.seasonNumber}</itunes:season>`,
        `      <itunes:episode>${episode.number}</itunes:episode>`,
        `      <itunes:explicit>${episode.explicit ? "true" : "false"}</itunes:explicit>`,
        settings.publicUrl
          ? `      <enclosure url="${escapeXml(`${settings.publicUrl}/episodes/${episode.id}.mp3`)}" length="${encodedSize}" type="audio/mpeg"/>`
          : "      <!-- no enclosure URL: hosting not configured -->",
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const categories = settings.categories
    .map((category) => `    <itunes:category text="${escapeXml(category)}"/>`)
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    `    <title>${escapeXml(settings.title)}</title>`,
    `    <description>${escapeXml(settings.description)}</description>`,
    `    <language>${escapeXml(settings.language)}</language>`,
    `    <itunes:author>${escapeXml(settings.author)}</itunes:author>`,
    `    <itunes:explicit>${settings.explicit ? "true" : "false"}</itunes:explicit>`,
    settings.coverImageUrl ? `    <itunes:image href="${escapeXml(settings.coverImageUrl)}"/>` : "    <!-- cover artwork not set -->",
    categories,
    itemsXml,
    "  </channel>",
    "</rss>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    xml,
    itemCount: items.length,
    warnings: feedWarnings(settings, items),
    publicUrl: settings.publicUrl,
  };
}

/** Derive the default feed settings from a show, so the UI starts populated. */
export function feedSettingsForShow(show: Show, author: string, language: string): RssFeedSettings {
  return {
    title: show.title,
    description: show.description,
    author,
    language,
    categories: show.categories,
    explicit: show.explicit,
    publicUrl: null,
    coverImageUrl: show.artworkDataUrl,
  };
}
