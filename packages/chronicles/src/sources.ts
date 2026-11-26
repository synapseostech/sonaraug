/**
 * Audio source registry for Medical Chronicles.
 *
 * Every episode's audio comes from exactly one source, and every source type is
 * declared here with what Sonara can honestly do with it. Nothing outside this
 * registry can become a playable or embeddable source: an arbitrary URL is
 * rejected, not "tried".
 *
 * NotebookLM: Sonara stores the share link and sends the listener to it. There
 * is no documented NotebookLM embed, playback, or transcription API, so we
 * never iframe it, scrape it, or claim to control its playback.
 */

export type SourceKind = "notebooklm_link" | "uploaded_audio" | "authorised_url";

/** Who drives playback. Sonara only reports progress for `sonara`. */
export type PlaybackControl = "sonara" | "provider";

export type SourceStatus = "active" | "unavailable" | "withdrawn";

export type ProviderDescriptor = {
  readonly kind: SourceKind;
  readonly label: string;
  readonly control: PlaybackControl;
  /** True only when a documented, permitted embed exists. None do today. */
  readonly embeddable: boolean;
  /** Whether Sonara can report position, duration and completion. */
  readonly reportsProgress: boolean;
  readonly note: string;
};

export const SOURCE_PROVIDERS: Readonly<Record<SourceKind, ProviderDescriptor>> = Object.freeze({
  notebooklm_link: {
    kind: "notebooklm_link",
    label: "NotebookLM Audio Overview (external link)",
    control: "provider",
    embeddable: false,
    reportsProgress: false,
    note: "Opens on NotebookLM under Google's access settings. Sonara cannot read or transcribe share links, or track playback.",
  },
  uploaded_audio: {
    kind: "uploaded_audio",
    label: "Uploaded audio (Sonara storage)",
    control: "sonara",
    embeddable: false,
    reportsProgress: true,
    note: "Served by Sonara after an access check. Full player controls.",
  },
  authorised_url: {
    kind: "authorised_url",
    label: "Authorised audio URL (allow-listed host)",
    control: "sonara",
    embeddable: false,
    reportsProgress: true,
    note: "A direct audio file on a host an administrator has allow-listed.",
  },
});

export type AudioSource =
  | { kind: "notebooklm_link"; url: string; notebookId: string }
  | { kind: "uploaded_audio"; assetId: string }
  | { kind: "authorised_url"; url: string; host: string };

export type SourceInput =
  | { kind: "notebooklm_link"; url: string }
  | { kind: "uploaded_audio"; assetId: string }
  | { kind: "authorised_url"; url: string };

export type SourceError =
  | "empty"
  | "not_a_url"
  | "insecure_scheme"
  | "credentials_in_url"
  | "unsupported_provider"
  | "not_a_notebook_link"
  | "host_not_allowlisted"
  | "ip_literal_host"
  | "invalid_asset";

export type SourceResult = { ok: true; source: AudioSource } | { ok: false; error: SourceError; message: string };

const MESSAGES: Record<SourceError, string> = {
  empty: "Enter a link.",
  not_a_url: "That is not a valid web address.",
  insecure_scheme: "Only https:// links are accepted.",
  credentials_in_url: "Links containing a username or password are not accepted.",
  unsupported_provider: "That site is not a supported audio provider.",
  not_a_notebook_link: "This does not look like a NotebookLM notebook share link (https://notebooklm.google.com/notebook/…).",
  host_not_allowlisted: "That host is not on the authorised audio host list. An administrator must allow-list it first.",
  ip_literal_host: "Links to raw IP addresses or local hosts are not accepted.",
  invalid_asset: "The uploaded audio reference is missing or invalid.",
};

const fail = (error: SourceError): SourceResult => ({ ok: false, error, message: MESSAGES[error] });

export const NOTEBOOKLM_HOST = "notebooklm.google.com";
const NOTEBOOKLM_SHORT_LINK_HOST = "notebooklm.link.google";
const NOTEBOOK_ID = /^[A-Za-z0-9_-]{6,128}$/;
/** Query parameters that identify the admin's own Google session and must not be stored. */
const STRIP_PARAMS = new Set(["authuser", "pli", "hl"]);

function parseHttps(raw: string): URL | SourceError {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "not_a_url";
  }
  if (url.protocol !== "https:") return "insecure_scheme";
  if (url.username || url.password) return "credentials_in_url";
  return url;
}

function isIpLiteralOrLocal(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host.includes(":")) return true; // IPv6
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true; // integer / hex IPv4 forms
  return false;
}

/** Validates and normalises a NotebookLM share link. */
export function parseNotebookLmLink(raw: string): SourceResult {
  const parsed = parseHttps(raw);
  if (typeof parsed === "string") return fail(parsed);
  const host = parsed.hostname.toLowerCase();
  if (parsed.port) return fail("unsupported_provider");
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (host === NOTEBOOKLM_SHORT_LINK_HOST) {
    const shortId = segments[0];
    if (segments.length !== 1 || !shortId || !NOTEBOOK_ID.test(shortId)) return fail("not_a_notebook_link");
    const clean = new URL(`https://${NOTEBOOKLM_SHORT_LINK_HOST}/${shortId}`);
    return { ok: true, source: { kind: "notebooklm_link", url: clean.toString(), notebookId: shortId } };
  }
  // Exact host match: lookalike domains are refused.
  if (host !== NOTEBOOKLM_HOST) return fail("unsupported_provider");
  if (segments[0] !== "notebook" || !segments[1] || !NOTEBOOK_ID.test(segments[1])) return fail("not_a_notebook_link");
  if (segments.length > 3 || (segments[2] !== undefined && !/^[a-z-]{1,20}$/.test(segments[2]))) {
    return fail("not_a_notebook_link");
  }
  const clean = new URL(`https://${NOTEBOOKLM_HOST}/${segments.join("/")}`);
  for (const [key, value] of parsed.searchParams) {
    if (!STRIP_PARAMS.has(key.toLowerCase())) clean.searchParams.append(key, value);
  }
  return { ok: true, source: { kind: "notebooklm_link", url: clean.toString(), notebookId: segments[1] } };
}

/** Validates a direct audio URL against an administrator-maintained allow-list of hosts. */
export function parseAuthorisedUrl(raw: string, allowedHosts: readonly string[]): SourceResult {
  const parsed = parseHttps(raw);
  if (typeof parsed === "string") return fail(parsed);
  const host = parsed.hostname.toLowerCase();
  if (isIpLiteralOrLocal(host)) return fail("ip_literal_host");
  if (parsed.port && parsed.port !== "443") return fail("host_not_allowlisted");
  const allowed = allowedHosts.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(host)) return fail("host_not_allowlisted");
  parsed.hash = "";
  return { ok: true, source: { kind: "authorised_url", url: parsed.toString(), host } };
}

const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function parseAudioSource(input: SourceInput, options: { allowedHosts: readonly string[] }): SourceResult {
  switch (input.kind) {
    case "notebooklm_link":
      return parseNotebookLmLink(input.url);
    case "authorised_url":
      return parseAuthorisedUrl(input.url, options.allowedHosts);
    case "uploaded_audio":
      return ASSET_ID.test(input.assetId) ? { ok: true, source: { kind: "uploaded_audio", assetId: input.assetId } } : fail("invalid_asset");
    default:
      return fail("unsupported_provider");
  }
}

/** Detects which supported provider a pasted link belongs to, if any. */
export function detectProvider(raw: string): SourceKind | null {
  try {
    const url = new URL(raw.trim());
    if ([NOTEBOOKLM_HOST, NOTEBOOKLM_SHORT_LINK_HOST].includes(url.hostname.toLowerCase())) return "notebooklm_link";
    return null;
  } catch {
    return null;
  }
}

/** Accepted upload types. Checked against magic bytes on the server, not only the extension. */
export const UPLOAD_AUDIO_TYPES = Object.freeze({
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".m4a"],
  "audio/aac": [".aac"],
  "audio/ogg": [".ogg", ".oga"],
  "audio/wav": [".wav"],
  "audio/webm": [".weba", ".webm"],
} as const);

export type UploadAudioType = keyof typeof UPLOAD_AUDIO_TYPES;

/**
 * Sniffs the container format from the first bytes of a file. Returns null when
 * the bytes are not a supported audio container, whatever the browser claimed.
 */
export function sniffAudioType(head: Uint8Array): UploadAudioType | null {
  const at = (i: number) => head[i] ?? -1;
  const ascii = (start: number, text: string) => [...text].every((ch, i) => at(start + i) === ch.charCodeAt(0));
  if (ascii(0, "ID3")) return "audio/mpeg";
  if (at(0) === 0xff && (at(1) & 0xe0) === 0xe0) {
    // MPEG audio frame sync vs ADTS AAC (layer bits 00).
    return (at(1) & 0x06) === 0 ? "audio/aac" : "audio/mpeg";
  }
  if (ascii(0, "OggS")) return "audio/ogg";
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav";
  if (ascii(4, "ftyp")) return "audio/mp4";
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return "audio/webm";
  return null;
}
