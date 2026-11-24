/**
 * Directory vocabulary and filtering.
 *
 * The brief requires a directory that expands beyond Uganda, so markets, genres
 * and languages are data — not hardcoded lists inside components.
 */

import type { CountryCode, Market } from "./types.ts";

export const MARKETS: readonly Market[] = [
  {
    code: "UG",
    name: "Uganda",
    iso: "UG",
    regions: ["Central", "Eastern", "Northern", "Western", "National"],
    languages: ["Luganda", "English", "Runyankole", "Acholi", "Ateso", "Lugbara", "Rukiga", "Lusoga", "Swahili"],
    live: true,
  },
  {
    code: "KE",
    name: "Kenya",
    iso: "KE",
    regions: ["Nairobi", "Coast", "Rift Valley", "Western", "National"],
    languages: ["Swahili", "English", "Kikuyu", "Luo"],
    live: false,
  },
  {
    code: "TZ",
    name: "Tanzania",
    iso: "TZ",
    regions: ["Dar es Salaam", "Arusha", "Mwanza", "Zanzibar", "National"],
    languages: ["Swahili", "English", "Sukuma"],
    live: false,
  },
  {
    code: "RW",
    name: "Rwanda",
    iso: "RW",
    regions: ["Kigali", "Northern", "Southern", "Eastern", "Western"],
    languages: ["Kinyarwanda", "English", "French"],
    live: false,
  },
  {
    code: "SS",
    name: "South Sudan",
    iso: "SS",
    regions: ["Juba", "Upper Nile", "Bahr el Ghazal", "Equatoria"],
    languages: ["English", "Arabic", "Dinka", "Nuer"],
    live: false,
  },
];

export function marketFor(code: CountryCode): Market {
  return MARKETS.find((market) => market.code === code) ?? MARKETS[0]!;
}

export const GENRES = [
  "Music",
  "News",
  "Talk",
  "Sports",
  "Culture",
  "Education",
  "Business",
  "Entertainment",
  "Religion",
  "Health",
  "Agriculture",
] as const;

export type Genre = (typeof GENRES)[number];

/** Podcast/video categories — a superset used by the creator studio. */
export const CONTENT_CATEGORIES = [
  "Society & Culture",
  "News",
  "Business",
  "Comedy",
  "Education",
  "Arts",
  "Music",
  "Sports",
  "Technology",
  "Health & Fitness",
  "Documentary",
] as const;

export type DirectoryQuery = {
  readonly country?: CountryCode;
  readonly region?: string;
  readonly city?: string;
  readonly language?: string;
  readonly genre?: string;
  readonly term?: string;
  readonly onlyVerified?: boolean;
  readonly includeSuspended?: boolean;
};

export type DirectoryStation = {
  readonly id: string;
  readonly name: string;
  readonly country: CountryCode;
  readonly region: string;
  readonly city: string;
  readonly frequency: string | null;
  readonly languages: readonly string[];
  readonly genres: readonly string[];
  readonly description: string;
  readonly operatingStatus: "on_air" | "off_air" | "unknown" | "suspended";
};

/** Pure, reusable filter — the directory page and the admin queue share it. */
export function filterStations<T extends DirectoryStation>(stations: readonly T[], query: DirectoryQuery): T[] {
  const term = (query.term ?? "").trim().toLowerCase();
  return stations.filter((station) => {
    if (query.country && station.country !== query.country) return false;
    if (query.region && station.region !== query.region) return false;
    if (query.city && station.city !== query.city) return false;
    if (query.language && !station.languages.includes(query.language)) return false;
    if (query.genre && !station.genres.includes(query.genre)) return false;
    if (!query.includeSuspended && station.operatingStatus === "suspended") return false;
    if (query.onlyVerified && station.operatingStatus !== "on_air") return false;
    if (!term) return true;
    return [station.name, station.city, station.region, station.frequency ?? "", station.description]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
}

/** City list for a market, derived (never a second hardcoded list). */
export function citiesFor(stations: readonly DirectoryStation[], country: CountryCode): string[] {
  return Array.from(new Set(stations.filter((s) => s.country === country).map((s) => s.city))).sort();
}
