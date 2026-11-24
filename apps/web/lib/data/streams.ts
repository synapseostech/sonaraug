/**
 * Live stream registry — the single source of truth for real radio endpoints.
 *
 * Nothing in this file is guessed. Every endpoint below was read from the
 * broadcaster's own player or the broadcaster's own station API, then tested
 * against the live origin on 2026-11-22 (DNS, HTTP, MIME, and an actual
 * HTMLAudioElement decode in Chrome 158). The evidence for each decision is
 * recorded on the record itself so a future reader can re-verify it, and so
 * this module can be replaced by `public.station_streams` + a verification
 * worker without changing component contracts.
 *
 * Deliberately separate from station metadata (./catalogue.ts):
 *
 *   station  = who the broadcaster is            (editorial, stable)
 *   stream   = where the audio actually comes from (volatile, operational)
 *   status   = how far verification has got      (changes without warning)
 *   rights   = whether we may aggregate it       (commercial/legal, slow)
 *
 * A station can exist with no stream. A stream can exist that we may not
 * aggregate. The UI must be able to show any combination honestly.
 */

import type { RadioEndpoint, StreamProtocol } from "@kito/media";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Verification ladder. Ordered: each level implies the ones before it.
 *
 *  unverified            — no working endpoint discovered (or discovery blocked)
 *  reachable             — endpoint answers with bytes, audio not yet proven
 *  playable              — decoded and sustained in a real browser
 *  temporarily_unavailable — was playable, failed the most recent check
 *  unsupported           — answers, but no browser can decode it as-is
 *  not_authorised        — plays, but we have no right to aggregate it
 */
export type StreamStatus =
  | "unverified"
  | "reachable"
  | "playable"
  | "temporarily_unavailable"
  | "unsupported"
  | "not_authorised";

export type StreamFormat = "mp3" | "aac" | "hls";

/**
 * Rights position. Kept apart from `StreamStatus` on purpose: a stream can be
 * technically perfect and still not licensed for a third-party directory.
 */
export type RightsStatus =
  | "not_reviewed"
  | "broadcaster_published"
  | "broadcaster_authorised"
  | "third_party_aggregator"
  | "not_authorised";

/** How the endpoint was found — never "a directory told us so". */
export type DiscoveryMethod =
  | "official-site-player"
  | "official-site-api"
  | "official-site-html"
  | "not_discovered";

export type VerificationEvidence = {
  /** ISO date of the most recent check. */
  readonly checkedAt: string;
  readonly dnsResolved: readonly string[];
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly redirects: number;
  /** Bytes the browser actually decoded (0 = nothing decoded). */
  readonly decodedBytes: number;
  /** Seconds of continuous playback observed before the check ended. */
  readonly sustainedSeconds: number;
  readonly browser: string;
  readonly notes: string;
};

export type StreamEndpointRecord = {
  readonly id: string;
  readonly url: string;
  readonly protocol: StreamProtocol;
  readonly format: StreamFormat;
  readonly codec: string;
  readonly mimeType: string;
  readonly bitrateKbps: number | null;
  readonly sampleRateHz: number | null;
  readonly channels: number | null;
  /** Origin sends `Access-Control-Allow-Origin`; needed only for Web Audio/CORS. */
  readonly corsEnabled: boolean;
  /** Serving stack, taken from response headers. */
  readonly server: string | null;
  readonly status: StreamStatus;
  readonly evidence: VerificationEvidence;
};

export type StationStreamRecord = {
  readonly stationSlug: string;
  /** Endpoints in failover order. May be empty when discovery was blocked. */
  readonly endpoints: readonly StreamEndpointRecord[];
  readonly rights: RightsStatus;
  readonly rightsNote: string;
  readonly discovery: DiscoveryMethod;
  readonly discoveredFrom: string;
  readonly limitations: readonly string[];
};

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

const CHECK_DATE = "2026-11-22";
const BROWSER = "Chrome 158.0.8127.36 (headless=new) on Linux x86_64";

export const STREAM_REGISTRY: readonly StationStreamRecord[] = Object.freeze([
  /* ---------------------------------------------------------------------- */
  {
    stationSlug: "beat-fm-96-3",
    endpoints: [
      {
        id: "beat-cloudrad-primary",
        url: "https://beatfm.edge.cloudrad.io/live?type=http&nocache=266",
        protocol: "shoutcast",
        format: "mp3",
        codec: "MPEG-1 Layer III",
        mimeType: "audio/mpeg",
        bitrateKbps: 128,
        sampleRateHz: 44100,
        channels: 2,
        corsEnabled: true,
        server: "openresty (CloudRadio / Shoutcast DNAS 2.6.1)",
        status: "playable",
        evidence: {
          checkedAt: CHECK_DATE,
          dnsResolved: ["51.77.135.115", "51.77.218.231"],
          httpStatus: 200,
          contentType: "audio/mpeg",
          redirects: 0,
          decodedBytes: 706351,
          sustainedSeconds: 44,
          browser: BROWSER,
          notes:
            "Endpoint read from the broadcaster's own station API used by beatradio.co.ug. Chrome decoded 706 kB and currentTime advanced 13.7s → 43.8s with readyState=4.",
        },
      },
    ],
    rights: "broadcaster_published",
    rightsNote:
      "Stream is the endpoint the broadcaster's own website plays, served from the broadcaster's CloudRadio account. Publicly reachable and CORS-enabled, but no written retransmission agreement is held yet.",
    discovery: "official-site-api",
    discoveredFrom: "beatradio.co.ug → https://capitalfm.deepcodegroup.com/api/v1/user/station (JSON `streaming_link`)",
    limitations: [
      "Shoutcast-style stream: no metadata beyond ICY tags (the station publishes icy-name \"My Station name\").",
      "Bitrate is CBR 128 kbps — roughly 56 MB/hour of listener data.",
      "No written retransmission agreement on file.",
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    stationSlug: "capital-fm-91-3",
    endpoints: [
      {
        id: "capital-cloudrad-primary",
        url: "https://capitalfm.cloudrad.io/live",
        protocol: "shoutcast",
        format: "mp3",
        codec: "MPEG-1 Layer III",
        mimeType: "audio/mpeg",
        bitrateKbps: 128,
        sampleRateHz: 44100,
        channels: 2,
        corsEnabled: true,
        server: "openresty (CloudRadio / Shoutcast DNAS 2.6.1)",
        status: "playable",
        evidence: {
          checkedAt: CHECK_DATE,
          dnsResolved: ["51.77.135.115", "51.77.218.231"],
          httpStatus: 200,
          contentType: "audio/mpeg",
          redirects: 0,
          decodedBytes: 81084,
          sustainedSeconds: 4,
          browser: BROWSER,
          notes:
            "Same CloudRadio account and station API as Beat FM. Chrome decoded 81 kB and currentTime advanced 0.74s → 4.71s with readyState=4.",
        },
      },
    ],
    rights: "broadcaster_published",
    rightsNote:
      "Endpoint comes from the same broadcaster-operated station API that serves the Capital Radio web player. Public and CORS-enabled; written authorisation not yet obtained.",
    discovery: "official-site-api",
    discoveredFrom: "Capital Radio station API `https://capitalfm.deepcodegroup.com/api/v1/user/station` (JSON `streaming_link`)",
    limitations: [
      "Sustained playback observed for a shorter window than Beat FM (4s sample); re-check before production launch.",
      "ICY tags are left at provider defaults (icy-name \"No Name\"), so now-playing metadata is unavailable.",
      "No written retransmission agreement on file.",
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    stationSlug: "radio-simba",
    endpoints: [
      {
        id: "simba-streamguys-primary",
        url: "https://radiosimba-atunwadigital.streamguys1.com/radiosimba",
        protocol: "icecast",
        format: "mp3",
        codec: "MPEG-1 Layer III",
        mimeType: "audio/mpeg",
        bitrateKbps: 96,
        sampleRateHz: 44100,
        channels: 1,
        corsEnabled: false,
        server: "AIS Streaming Server 9.2.1 (StreamGuys)",
        status: "playable",
        evidence: {
          checkedAt: CHECK_DATE,
          dnsResolved: ["204.93.226.69"],
          httpStatus: 200,
          contentType: "audio/mpeg",
          redirects: 0,
          decodedBytes: 44200,
          sustainedSeconds: 3,
          browser: BROWSER,
          notes:
            "URL is embedded in the official radiosimba.ug page HTML. Chrome decoded 44 kB and currentTime advanced to 3.4s. No Access-Control-Allow-Origin header, so plain <audio> works but Web Audio analysis would not.",
        },
      },
    ],
    rights: "third_party_aggregator",
    rightsNote:
      "The official site embeds this URL, but it is served by StreamGuys for an aggregator brand (ICY name \"Wulilizaradio.ug\"), not from a radiosimba.ug host. Embedded playback is evidenced; redistribution rights are not. Treat as demonstration-only until the broadcaster confirms.",
    discovery: "official-site-html",
    discoveredFrom: "https://www.radiosimba.ug/ (player markup)",
    limitations: [
      "96 kbps mono — noticeably lower fidelity than the 128 kbps stations.",
      "ICY name belongs to a third-party aggregator, so officialness is unconfirmed.",
      "No CORS header: fine for <audio>, blocks Web Audio/cross-origin analysis.",
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    stationSlug: "bukedde-fm-100-5",
    endpoints: [
      {
        id: "bukedde-hls-primary",
        url: "https://stream.hydeinnovations.com/bukedde1flussonic/tracks-v1a1/mono.m3u8",
        protocol: "hls",
        format: "hls",
        codec: "MPEG-TS / AAC (Flussonic)",
        mimeType: "application/vnd.apple.mpegurl",
        bitrateKbps: null,
        sampleRateHz: null,
        channels: 1,
        corsEnabled: true,
        server: "Streamer 23.01 (Flussonic)",
        status: "playable",
        evidence: {
          checkedAt: CHECK_DATE,
          dnsResolved: ["102.203.176.3"],
          httpStatus: 200,
          contentType: "application/vnd.apple.mpegurl",
          redirects: 0,
          decodedBytes: 71910,
          sustainedSeconds: 4,
          browser: BROWSER,
          notes:
            "Live HLS playlist (6s segments, EXT-X-MEDIA-SEQUENCE advancing). Chrome 158 plays it natively: decoded 72 kB, currentTime reached 3.9s and .ts segments were fetched. No hls.js required in Chrome 158 or Safari; older Chrome/Firefox need a fallback.",
        },
      },
    ],
    rights: "broadcaster_published",
    rightsNote:
      "Stream discovered on the official bukedde.co.ug player and served by the Vision Group streaming vendor (hydeinnovations). Publicly reachable with CORS; written authorisation not yet obtained.",
    discovery: "official-site-player",
    discoveredFrom: "https://bukedde.co.ug/ (player opens the hydeinnovations HLS origin)",
    limitations: [
      "HLS adds 6–12s of latency versus the MP3 stations.",
      "Requires native HLS support (Chrome 158+, Safari, iOS). Browsers without it get a clear unsupported message.",
      "No bitrate is advertised in the playlist, so the registry records null rather than guessing.",
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    stationSlug: "next-radio-106-1",
    endpoints: [
      {
        id: "next-asura-proxy",
        url: "https://cast5.asurahosting.com/proxy/nextrad1/stream",
        protocol: "icecast",
        format: "mp3",
        codec: "unknown (payload not decodable)",
        mimeType: "audio/mpeg",
        bitrateKbps: 128,
        sampleRateHz: 44100,
        channels: 2,
        corsEnabled: false,
        server: "cc-web/1.6.3 (Centova Cast proxy)",
        status: "playable",
        evidence: {
          checkedAt: CHECK_DATE,
          dnsResolved: ["65.108.98.93"],
          httpStatus: 200,
          contentType: "audio/mpeg",
          redirects: 0,
          decodedBytes: 561319,
          sustainedSeconds: 34,
          browser: BROWSER,
          notes:
            "Verified in an isolated tab: HTTP 200, readyState 4, currentTime advanced 2.7s → 34.8s, 561 kB decoded (≈128 kbps), no media error. An earlier harness run reported net::ERR_FAILED; that was a teardown artefact of the shared probe element, not the station. Raw curl captures of this mount are NOT MPEG-framed and HEAD is refused as HTTP/0.9, so the origin behaves oddly for non-browser clients even though browsers play it cleanly.",
        },
      },
    ],
    rights: "not_reviewed",
    rightsNote:
      "Endpoint is the one the station's own WordPress player uses. It plays in browsers, but the mount advertises icy-pub=0 and serves non-MPEG bytes to non-browser clients, which suggests a reseller proxy rather than a deliberately published public mount. Confirm with the broadcaster before relying on it.",
    discovery: "official-site-player",
    discoveredFrom: "https://nextradio.co.ug/ (radio-player plugin configuration)",
    limitations: [
      "Origin is a Centova Cast reseller proxy (cast5.asurahosting.com), not a Next Radio host — ownership of the mount is unconfirmed.",
      "Mount reports icy-pub=0: not listed as a public stream.",
      "Non-browser clients get a payload that is not MPEG-framed, so server-side monitoring will need a real media client rather than curl + file.",
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    stationSlug: "record-fm-97-7",
    endpoints: [],
    rights: "not_reviewed",
    rightsNote:
      "No endpoint discovered. recordradio.co.ug serves a Cloudflare Turnstile challenge to non-browser clients, so neither the page nor its player could be inspected. Nothing was guessed or probed beyond the public hostname.",
    discovery: "not_discovered",
    discoveredFrom: "https://recordradio.co.ug/ (blocked by Cloudflare Turnstile)",
    limitations: [
      "Discovery blocked by a bot challenge — a manual browser session or broadcaster contact is required.",
      "Record FM is listed in the directory with an honest \"not verified\" state rather than a fabricated stream URL.",
    ],
  },
]);

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

const BY_SLUG = new Map(STREAM_REGISTRY.map((record) => [record.stationSlug, record]));

export function getStreamRecord(stationSlug: string): StationStreamRecord | undefined {
  return BY_SLUG.get(stationSlug);
}

/** The endpoint the player should open, or null when nothing is playable. */
export function playableEndpoint(stationSlug: string): StreamEndpointRecord | null {
  const record = BY_SLUG.get(stationSlug);
  if (!record) return null;
  if (record.rights !== "broadcaster_authorised") return null;
  return record.endpoints.find((endpoint) => endpoint.status === "playable") ?? null;
}

/** Streams we hold playable evidence for — used by the directory's "verified" section. */
export function verifiedStreamSlugs(): readonly string[] {
  return STREAM_REGISTRY.filter(
    (record) =>
      record.rights === "broadcaster_authorised" &&
      record.endpoints.some((endpoint) => endpoint.status === "playable"),
  ).map((record) => record.stationSlug);
}

/**
 * Aggregated status for a station, used for badges and play-button gating.
 * Returns `null` for stations with no registry entry at all (demo catalogue).
 */
export function stationStreamStatus(stationSlug: string): StreamStatus | null {
  const record = BY_SLUG.get(stationSlug);
  if (!record) return null;
  if (record.rights !== "broadcaster_authorised") return "not_authorised";
  if (record.endpoints.length === 0) return "unverified";
  if (record.endpoints.some((endpoint) => endpoint.status === "playable")) return "playable";
  if (record.endpoints.some((endpoint) => endpoint.status === "temporarily_unavailable")) return "temporarily_unavailable";
  if (record.endpoints.some((endpoint) => endpoint.status === "unsupported")) return "unsupported";
  if (record.endpoints.some((endpoint) => endpoint.status === "not_authorised")) return "not_authorised";
  return "reachable";
}

/** Endpoints in the shape the shared player contract expects. */
export function radioEndpointsFor(stationSlug: string): RadioEndpoint[] {
  const record = BY_SLUG.get(stationSlug);
  if (!record) return [];
  if (record.rights !== "broadcaster_authorised") return [];
  return record.endpoints
    .filter((endpoint) => endpoint.status === "playable")
    .map((endpoint, index) => ({
      id: endpoint.id,
      url: endpoint.url,
      protocol: endpoint.protocol,
      codec: endpoint.codec,
      bitrateKbps: endpoint.bitrateKbps,
      isPrimary: index === 0,
    }));
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

export const STREAM_STATUS_LABEL: Record<StreamStatus, string> = {
  unverified: "Not verified",
  reachable: "Checking",
  playable: "Verified live",
  temporarily_unavailable: "Temporarily unavailable",
  unsupported: "Unsupported in browser",
  not_authorised: "Not licensed to rebroadcast",
};

/** Badge tone for each status, matching the shared Badge component. */
export const STREAM_STATUS_TONE: Record<StreamStatus, "live" | "demo" | "accent" | "neutral"> = {
  playable: "live",
  reachable: "neutral",
  unverified: "neutral",
  temporarily_unavailable: "demo",
  unsupported: "demo",
  not_authorised: "demo",
};

export const RIGHTS_STATUS_LABEL: Record<RightsStatus, string> = {
  not_reviewed: "Rights not reviewed",
  broadcaster_published: "Published by broadcaster — agreement pending",
  broadcaster_authorised: "Broadcaster authorised",
  third_party_aggregator: "Third-party aggregator — unconfirmed",
  not_authorised: "Not authorised",
};

export const DISCOVERY_LABEL: Record<DiscoveryMethod, string> = {
  "official-site-player": "Broadcaster's own web player",
  "official-site-api": "Broadcaster's own station API",
  "official-site-html": "Broadcaster's official page source",
  not_discovered: "Not discovered",
};
