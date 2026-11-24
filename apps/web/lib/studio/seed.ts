/**
 * Demonstration data for the studio and admin workspaces.
 *
 * Every station here is fictional or explicitly marked demo: no real
 * broadcaster partnership is implied, and every stream URL uses a reserved
 * example host so nothing can be mistaken for a live endpoint.
 */

import type {
  BroadcastSession,
  Channel,
  ContentReport,
  Episode,
  MediaAsset,
  ModerationRecord,
  ProgrammeSlot,
  Show,
  StationSubmission,
  StreamEndpointDraft,
  VideoItem,
} from "@kito/studio";

export type StudioSeed = {
  readonly channels: readonly Channel[];
  readonly shows: readonly Show[];
  readonly episodes: readonly Episode[];
  readonly videos: readonly VideoItem[];
  readonly submissions: readonly StationSubmission[];
  readonly media: readonly MediaAsset[];
  readonly reports: readonly ContentReport[];
  readonly moderation: readonly ModerationRecord[];
  readonly programmes: readonly ProgrammeSlot[];
  readonly sessions: readonly BroadcastSession[];
};

const T = (iso: string) => iso;

function endpoint(id: string, label: string, url: string, role: "primary" | "backup", health: StreamEndpointDraft["health"] = "unverified"): StreamEndpointDraft {
  const healthy = health === "healthy";
  return {
    id,
    label,
    url,
    role,
    format: "mp3",
    bitrateKbps: 128,
    health,
    lastCheckedAt: healthy ? T("2026-11-21T18:20:00.000Z") : null,
    lastSuccessAt: healthy ? T("2026-11-21T18:20:00.000Z") : null,
    lastFailureAt: health === "failing" ? T("2026-11-21T18:22:00.000Z") : null,
    lastFailureReason: health === "failing" ? "Connection reset after 4s" : null,
    verifiedByPlatform: healthy,
    history: healthy
      ? [
          {
            id: `${id}-h1`,
            at: T("2026-11-21T18:20:00.000Z"),
            actorRole: "platform_monitor",
            result: "healthy",
            detail: "Simulated monitor: 200 audio/mpeg, decoded 706 kB over 44s.",
            decodedBytes: 706351,
            sustainedSeconds: 44,
          },
        ]
      : [],
  };
}

function submission(input: {
  id: string;
  name: string;
  frequency: string | null;
  city: string;
  region: string;
  status: StationSubmission["status"];
  languages: string[];
  genres: string[];
  description: string;
  permission: StationSubmission["integrationPermission"];
  streams: StreamEndpointDraft[];
  changeRequest?: string | null;
  operating?: StationSubmission["operatingStatus"];
  isDemo?: boolean;
  submittedAt?: string | null;
}): StationSubmission {
  return {
    id: input.id,
    name: input.name,
    frequency: input.frequency,
    country: "UG",
    region: input.region,
    city: input.city,
    languages: input.languages,
    genres: input.genres,
    description: input.description,
    website: `https://${input.name.toLowerCase().replace(/[^a-z]+/g, "-")}.example.ug`,
    logoSeed: input.id,
    logoDataUrl: null,
    status: input.status,
    operatingStatus: input.operating ?? "unknown",
    integrationPermission: input.permission,
    streams: input.streams,
    evidence: {
      ownershipStatement:
        "We own and operate the station and hold the broadcast licence for the frequency listed.",
      broadcastingLicence: `UCC/${input.id.toUpperCase()}/2024`,
      contactName: "Programmes desk",
      contactEmail: `desk@${input.name.toLowerCase().replace(/[^a-z]+/g, "-")}.example.ug`,
      contactPhone: "+256 700 000 000",
      documents: [
        { id: `${input.id}-doc-1`, name: "Licence summary (demo).pdf", note: "Placeholder document — no file is uploaded in this build." },
      ],
    },
    submittedAt: input.submittedAt ?? T("2026-11-18T09:30:00.000Z"),
    createdAt: T("2026-11-17T08:00:00.000Z"),
    updatedAt: T("2026-11-20T10:00:00.000Z"),
    changeRequest: input.changeRequest ?? null,
    decisions: [],
    isDemo: input.isDemo ?? true,
  };
}

const channel: Channel = {
  id: "ch-namutebi",
  name: "Namutebi Audio",
  slug: "namutebi-audio",
  kind: "both",
  bio: "Kampala-based independent audio and video producer. Long-form interviews about how the city actually works.",
  avatarSeed: "ch-namutebi",
  country: "UG",
  languages: ["English", "Luganda"],
  createdAt: T("2026-02-11T07:00:00.000Z"),
  followersDemo: 4120,
};

const shows: readonly Show[] = [
  {
    id: "show-kampala-conversations",
    channelId: channel.id,
    title: "Kampala Conversations",
    slug: "kampala-conversations",
    description:
      "One guest, one hour, no press release. Conversations with the people quietly holding Kampala together — boda economists, market chairs, water engineers.",
    categories: ["Society & Culture"],
    languages: ["English", "Luganda"],
    hosts: [
      { id: "host-aisha", name: "Aisha Namutebi", role: "Host" },
      { id: "host-kato", name: "Kato Ssemakula", role: "Producer" },
    ],
    artworkSeed: "show-kampala-conversations",
    artworkDataUrl: null,
    explicit: false,
    createdAt: T("2026-03-02T09:00:00.000Z"),
    reviewStatus: "approved",
    rights: "original",
  },
  {
    id: "show-matatu-chronicles",
    channelId: channel.id,
    title: "Matatu Chronicles",
    slug: "matatu-chronicles",
    description:
      "Short field recordings from Kampala's taxi parks: conductors, passengers, and the economics of a fourteen-seat run.",
    categories: ["Documentary", "Society & Culture"],
    languages: ["Luganda", "English"],
    hosts: [{ id: "host-aisha", name: "Aisha Namutebi", role: "Host" }],
    artworkSeed: "show-matatu-chronicles",
    artworkDataUrl: null,
    explicit: false,
    createdAt: T("2026-06-14T09:00:00.000Z"),
    reviewStatus: "pending",
    rights: "original",
  },
];

function episode(input: {
  id: string;
  showId: string;
  number: number;
  season?: number;
  title: string;
  description: string;
  status: Episode["publicationStatus"];
  review: Episode["reviewStatus"];
  audio: Episode["audioSource"];
  assetId?: string | null;
  duration?: number | null;
  publishedAt?: string | null;
  scheduledFor?: string | null;
  reviewNote?: string | null;
}): Episode {
  return {
    id: input.id,
    showId: input.showId,
    seasonNumber: input.season ?? 1,
    number: input.number,
    title: input.title,
    description: input.description,
    audioSource: input.audio,
    mediaAssetId: input.assetId ?? null,
    durationSeconds: input.duration ?? null,
    explicit: false,
    rights: "original",
    publicationStatus: input.status,
    reviewStatus: input.review,
    scheduledFor: input.scheduledFor ?? null,
    publishedAt: input.publishedAt ?? null,
    createdAt: T("2026-10-01T09:00:00.000Z"),
    updatedAt: T("2026-11-20T09:00:00.000Z"),
    reviewNote: input.reviewNote ?? null,
    history: [],
  };
}

const episodes: readonly Episode[] = [
  episode({
    id: "ep-boda",
    showId: "show-kampala-conversations",
    number: 3,
    title: "What a boda stage knows about the city's cash",
    description:
      "A stage chairman in Wandegeya explains credit, trust and why the fare to Kisaasi changes at 9pm. Recorded on a phone, cleaned up in the studio.",
    status: "published",
    review: "approved",
    audio: "recording",
    assetId: "asset-boda",
    duration: 1854,
    publishedAt: T("2026-11-08T05:00:00.000Z"),
  }),
  episode({
    id: "ep-water",
    showId: "show-kampala-conversations",
    number: 4,
    title: "The engineer who maps Kampala's leaks",
    description:
      "A water utility engineer walks us through a map of pipe losses across five divisions, and what a fixed leak is worth in shillings.",
    status: "review",
    review: "pending",
    audio: "recording",
    assetId: "asset-water",
    duration: 2402,
  }),
  episode({
    id: "ep-market",
    showId: "show-kampala-conversations",
    number: 5,
    title: "Owino at 5am",
    description: "Draft: sound notes from the market before the stalls open. Needs a host intro and a final mix.",
    status: "editing",
    review: "not_submitted",
    audio: "recording",
    assetId: "asset-market",
    duration: 958,
  }),
  episode({
    id: "ep-taxi",
    showId: "show-matatu-chronicles",
    number: 1,
    title: "Fourteen seats, one route",
    description: "A conductor on the Ntinda–Kampala run counts fares, fuel and the cost of a breakdown.",
    status: "draft",
    review: "not_submitted",
    audio: "none",
  }),
];

const videos: readonly VideoItem[] = [
  {
    id: "vid-market-film",
    channelId: channel.id,
    title: "Owino, before the stalls open",
    description:
      "A seven-minute observational film shot between 4:30 and 6:00am in Owino market, with sound recorded on location.",
    category: "Documentary",
    tags: ["Kampala", "markets", "short film"],
    visibility: "public",
    thumbnail: "auto",
    fileName: "owino-market-cut-v4.mp4",
    fileSizeBytes: 184_320_000,
    durationSeconds: 428,
    rights: "original",
    publicationStatus: "published",
    reviewStatus: "approved",
    publishedAt: T("2026-11-02T07:00:00.000Z"),
    createdAt: T("2026-10-20T07:00:00.000Z"),
    updatedAt: T("2026-11-02T07:00:00.000Z"),
    reviewNote: null,
    history: [],
  },
  {
    id: "vid-studio-tour",
    channelId: channel.id,
    title: "Studio tour: building a booth in a bedroom",
    description: "Draft: how we treated a 3×3m room with blankets, a mattress and one very patient landlord.",
    category: "Technology",
    tags: ["audio", "studio", "budget"],
    visibility: "private",
    thumbnail: "auto",
    fileName: null,
    fileSizeBytes: null,
    durationSeconds: null,
    rights: "undisclosed",
    publicationStatus: "draft",
    reviewStatus: "not_submitted",
    publishedAt: null,
    createdAt: T("2026-11-19T07:00:00.000Z"),
    updatedAt: T("2026-11-19T07:00:00.000Z"),
    reviewNote: null,
    history: [],
  },
];

const media: readonly MediaAsset[] = [
  {
    id: "asset-boda",
    name: "boda-stage-mix-v3.webm",
    kind: "recording",
    mimeType: "audio/webm",
    sizeBytes: 21_450_000,
    durationSeconds: 1854,
    createdAt: T("2026-11-07T16:10:00.000Z"),
    localOnly: true,
    source: "Recorded in this browser (earlier session)",
  },
  {
    id: "asset-water",
    name: "water-engineer-interview.webm",
    kind: "recording",
    mimeType: "audio/webm",
    sizeBytes: 27_800_000,
    durationSeconds: 2402,
    createdAt: T("2026-11-18T11:40:00.000Z"),
    localOnly: true,
    source: "Recorded in this browser",
  },
  {
    id: "asset-market",
    name: "owino-ambience-notes.webm",
    kind: "upload",
    mimeType: "audio/webm",
    sizeBytes: 12_100_000,
    durationSeconds: 958,
    createdAt: T("2026-11-20T05:20:00.000Z"),
    localOnly: true,
    source: "Selected from this device",
  },
];

const submissions: readonly StationSubmission[] = [
  submission({
    id: "sub-mbarara",
    name: "Mbarara FM",
    frequency: "88.9 FM",
    city: "Mbarara",
    region: "Western",
    status: "approved",
    languages: ["Runyankole", "English"],
    genres: ["Music", "Talk"],
    description: "Demo listing: Runyankole music and talk for Mbarara and the western region.",
    permission: "granted",
    operating: "on_air",
    streams: [endpoint("st-mbarara-1", "Primary", "https://stream.example.ug/mbarara/live", "primary", "healthy")],
  }),
  submission({
    id: "sub-gulu",
    name: "Gulu Voice",
    frequency: "92.5 FM",
    city: "Gulu",
    region: "Northern",
    status: "under_review",
    languages: ["Acholi", "English"],
    genres: ["News", "Culture"],
    description: "Demo listing: Acholi-language news and culture programming from Gulu.",
    permission: "pending",
    streams: [endpoint("st-gulu-1", "Primary", "https://stream.example.ug/gulu/live", "primary")],
    changeRequest: null,
  }),
  submission({
    id: "sub-kidepo",
    name: "Kidepo FM",
    frequency: "95.2 FM",
    city: "Moroto",
    region: "Northern",
    status: "changes_requested",
    languages: ["Ateso"],
    genres: ["Education", "Agriculture"],
    description: "Demo listing: Ateso-language education and livestock programming.",
    permission: "pending",
    streams: [endpoint("st-kidepo-1", "Primary", "https://stream.example.ug/kidepo/live", "primary", "failing")],
    changeRequest: "The stream returns an HTML page rather than audio. Please supply a direct MP3 or HLS endpoint.",
  }),
  submission({
    id: "sub-nakawa",
    name: "Nakawa Community Radio",
    frequency: null,
    city: "Kampala",
    region: "Central",
    status: "draft",
    languages: ["Luganda"],
    genres: ["Talk", "Education"],
    description: "Draft submission: a community station run with Nakawa market vendors.",
    permission: "not_requested",
    streams: [],
    submittedAt: null,
  }),
  submission({
    id: "sub-lakeside",
    name: "Lakeside FM",
    frequency: "97.4 FM",
    city: "Entebbe",
    region: "Central",
    status: "submitted",
    languages: ["Luganda", "English"],
    genres: ["Talk", "Music"],
    description: "Demo listing: lake safety bulletins and music for fishing communities.",
    permission: "pending",
    streams: [endpoint("st-lakeside-1", "Primary", "https://stream.example.ug/lakeside/live", "primary")],
  }),
  submission({
    id: "sub-bwindi",
    name: "Bwindi Culture Radio",
    frequency: "94.6 FM",
    city: "Kanungu",
    region: "Western",
    status: "rejected",
    languages: ["Rukiga"],
    genres: ["Culture"],
    description: "Demo listing that failed review: no verifiable licence document and a third-party stream host.",
    permission: "denied",
    streams: [endpoint("st-bwindi-1", "Primary", "https://stream.example.ug/bwindi/live", "primary", "failing")],
    changeRequest: "Rejected: the stream host does not match the applicant and no licence evidence was supplied.",
  }),
  submission({
    id: "sub-nile",
    name: "Nile Wave",
    frequency: "96.1 FM",
    city: "Jinja",
    region: "Eastern",
    status: "suspended",
    languages: ["Lusoga", "English"],
    genres: ["Music", "News"],
    description: "Demo listing suspended after repeated stream failures and an unresolved rights query.",
    permission: "pending",
    operating: "suspended",
    streams: [endpoint("st-nile-1", "Primary", "https://stream.example.ug/nile/live", "primary", "failing")],
  }),
];

const reports: readonly ContentReport[] = [
  {
    id: "rep-1",
    targetKind: "podcast_episode",
    targetId: "ep-water",
    targetTitle: "The engineer who maps Kampala's leaks",
    reason: "Possible rights issue",
    detail: "A listener says the intro music is a commercial track. Needs a rights check before publishing.",
    reporter: "listener@example.ug",
    createdAt: T("2026-11-20T08:15:00.000Z"),
    status: "open",
  },
  {
    id: "rep-2",
    targetKind: "video",
    targetId: "vid-market-film",
    targetTitle: "Owino, before the stalls open",
    reason: "Consent",
    detail: "A person identifiable in the background asks to be removed from the film.",
    reporter: "community@example.ug",
    createdAt: T("2026-11-19T14:02:00.000Z"),
    status: "open",
  },
  {
    id: "rep-3",
    targetKind: "station",
    targetId: "sub-nile",
    targetTitle: "Nile Wave",
    reason: "Stream not the broadcaster's",
    detail: "The submitted stream host belongs to an aggregator, not the station.",
    reporter: "reviewer@example.ug",
    createdAt: T("2026-11-15T09:00:00.000Z"),
    status: "actioned",
  },
];

const moderation: readonly ModerationRecord[] = [
  {
    id: "mod-1",
    at: T("2026-11-15T09:30:00.000Z"),
    targetKind: "station",
    targetTitle: "Nile Wave",
    action: "suspend",
    reason: "Third-party stream host without authorisation; repeated verification failures.",
    actor: "Platform admin",
  },
  {
    id: "mod-2",
    at: T("2026-11-12T10:10:00.000Z"),
    targetKind: "podcast_episode",
    targetTitle: "What a boda stage knows about the city's cash",
    action: "approve",
    reason: "Rights declared as original; audio checked.",
    actor: "Platform reviewer",
  },
];

const programmes: readonly ProgrammeSlot[] = [
  { id: "pr-1", stationId: "sub-mbarara", title: "Morning drive", host: "Tumusiime Alex", startsAt: "2026-11-23T04:00:00.000Z", durationMinutes: 180, notes: "Music, headlines, market prices." },
  { id: "pr-2", stationId: "sub-mbarara", title: "Market hour", host: "Kemigisha Doreen", startsAt: "2026-11-23T07:00:00.000Z", durationMinutes: 60, notes: "Livestock and produce prices from Mbarara main market." },
  { id: "pr-3", stationId: "sub-mbarara", title: "Evening request show", host: "Tumusiime Alex", startsAt: "2026-11-23T16:00:00.000Z", durationMinutes: 120, notes: "Listener requests and dedications." },
  { id: "pr-4", stationId: "sub-gulu", title: "Acholi news hour", host: "Okello Patrick", startsAt: "2026-11-23T05:00:00.000Z", durationMinutes: 60, notes: "Regional news and call-ins." },
];

const sessions: readonly BroadcastSession[] = [
  {
    id: "bcast-1",
    stationId: "sub-mbarara",
    title: "Morning drive",
    host: "Tumusiime Alex",
    startedAt: null,
    simulatedState: "idle",
    listenersDemo: 0,
    ingestTarget: "rtmp://ingest.example.ug/live/mbarara (not configured)",
  },
];

export const STUDIO_SEED: StudioSeed = {
  channels: [channel],
  shows,
  episodes,
  videos,
  submissions,
  media,
  reports,
  moderation,
  programmes,
  sessions,
};
