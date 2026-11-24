"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Artwork, Badge, Button, EmptyState, HeartIcon, IconButton, PauseIcon, PlayIcon, PlusIcon, SectionHeader } from "@kito/ui";
import { PlayPauseButton, StationStatusBadge, StationTile } from "../../../components/cards.tsx";
import { CATEGORY_LABELS, LANGUAGE_LABELS, REGION_LABELS } from "../../../lib/data/catalogue.ts";
import { getStation, relatedStations } from "../../../lib/data/queries.ts";
import { DISCOVERY_LABEL, RIGHTS_STATUS_LABEL, STREAM_STATUS_LABEL, getStreamRecord, playableEndpoint, stationStreamStatus } from "../../../lib/data/streams.ts";
import { formatCount } from "../../../lib/format.ts";
import { useLibrary } from "../../../lib/library.tsx";
import { stationPlayable } from "../../../lib/playables.ts";
import { usePlayer } from "../../../lib/player.tsx";

/**
 * Only rendered for fictional demo stations. Real station pages never invent a
 * schedule — the brief forbids it, and a wrong schedule is worse than none.
 */
const DEMO_SCHEDULE = [
  { time: "06:00", show: "Morning drive", detail: "News, traffic and the first requests of the day" },
  { time: "10:00", show: "Mid-morning show", detail: "Music, call-ins and a long conversation" },
  { time: "13:00", show: "Lunchtime bulletin", detail: "Headlines, markets and sport" },
  { time: "16:00", show: "Afternoon mix", detail: "Requests, dedications and new releases" },
  { time: "20:00", show: "Evening programme", detail: "Talk, culture and listener stories" },
];

/** Current connection state, worded for a listener rather than an engineer. */
function connectionSummary(player: ReturnType<typeof usePlayer>, verified: boolean): string {
  switch (player.status) {
    case "loading":
      return "Connecting to the stream…";
    case "buffering":
      return "Connected — filling the buffer…";
    case "reconnecting":
      return `Lost the connection — reconnecting (${player.liveConnection.attempt}/${player.liveConnection.maxAttempts})…`;
    case "playing":
      return "Playing live now";
    case "paused":
      return "Paused. Resuming rejoins the live broadcast.";
    case "error":
      return player.errorMessage ?? "The stream is not responding.";
    default:
      return verified ? "Ready to play" : "Not connected";
  }
}

export default function StationPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const station = getStation(slug);
  const library = useLibrary();
  const player = usePlayer();

  if (!station) {
    return (
      <EmptyState
        title="Station not found"
        description="That station is not in the directory."
        action={
          <Link href="/radio" className="kt-btn kt-btn--secondary kt-btn--sm">
            Back to radio
          </Link>
        }
      />
    );
  }

  const item = stationPlayable(station);
  const favourite = library.isFavouriteStation(station.slug);
  const similar = relatedStations(station, 3);
  const isReal = station.origin === "broadcaster";
  const record = getStreamRecord(station.slug);
  const endpoint = playableEndpoint(station.slug);
  const status = stationStreamStatus(station.slug);
  const playable = status === "playable" && Boolean(item.audioUrl);
  const active = player.isCurrent(item.key);
  const playing = active && (player.status === "playing" || player.status === "buffering");

  return (
    <>
      <Link href="/radio" className="small muted" style={{ display: "inline-block", marginBottom: 18 }}>
        ← All stations
      </Link>

      <header className="detail-hdr">
        <div className="detail-hdr__art">
          <Artwork seed={station.id} title={station.name} shape="round" />
        </div>
        <div className="detail-hdr__info">
          <p className="detail-hdr__kind">
            {/* "Real" = an actual broadcaster. Platform verification of the organisation does not exist yet. */}
            {isReal ? "Live radio · real Ugandan broadcaster" : "Live radio · demo station"}
          </p>
          <h1 className="detail-hdr__title">{station.name}</h1>
          <p className="detail-hdr__desc">{station.tagline}</p>
          <div className="detail-hdr__meta">
            <StationStatusBadge station={station} />
            <span>{station.frequency ?? "Frequency not verified"}</span>
            <span>·</span>
            <span>
              {station.city}, {REGION_LABELS[station.region]}
            </span>
            {station.listeners !== undefined ? (
              <>
                <span>·</span>
                <span>{formatCount(station.listeners)} listening (demo)</span>
              </>
            ) : null}
            {station.established !== undefined ? (
              <>
                <span>·</span>
                <span>On air since {station.established}</span>
              </>
            ) : null}
          </div>
          <div className="detail-hdr__actions">
            <Button
              variant="primary"
              onClick={() => (active ? player.toggle() : player.play(item))}
              disabled={!playable && !active}
              aria-disabled={!playable && !active}
            >
              {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />} {playing ? "Pause live" : playable ? "Listen live" : "Stream not available"}
            </Button>
            <Button variant="secondary" onClick={() => library.toggleFavouriteStation(station.slug)} aria-pressed={favourite}>
              <HeartIcon filled={favourite} size={15} /> {favourite ? "Favourited" : "Favourite"}
            </Button>
            <IconButton label="Add to queue" onClick={() => player.addToQueue(item)}>
              <PlusIcon size={16} />
            </IconButton>
          </div>
        </div>
      </header>

      {isReal ? (
        <section className="block" aria-label="Stream connection">
          <SectionHeader
            title="Connection"
            subtitle={playable ? "Live audio is served directly by the broadcaster's streaming provider" : "Why this station is not playing"}
          />
          <div className="stream-panel">
            <div className="stream-panel__state">
              <span className={`stream-panel__dot stream-panel__dot--${playable ? (active ? player.status : "ready") : "off"}`} aria-hidden="true" />
              <div>
                <p className="stream-panel__headline">
                  {playable ? (active ? connectionSummary(player, true) : "Verified live stream") : (status ? STREAM_STATUS_LABEL[status] : "Not verified")}
                </p>
                <p className="small muted">
                  {active
                    ? connectionSummary(player, playable)
                    : playable
                      ? "Press Listen live to connect."
                      : status === "not_authorised"
                        ? "Playback stays off until the broadcaster's retransmission authorisation is recorded."
                        : "Playback is disabled for this station."}
                </p>
              </div>
              {playable ? (
                <Button variant="secondary" size="sm" onClick={() => (active ? player.toggle() : player.play(item))}>
                  {playing ? "Pause" : "Play"}
                </Button>
              ) : null}
            </div>

            <dl className="stream-facts">
              <dt>Status</dt>
              <dd>{status ? STREAM_STATUS_LABEL[status] : "Unknown"}</dd>
              <dt>Format</dt>
              <dd>
                {endpoint
                  ? `${endpoint.format === "hls" ? "HLS" : endpoint.format.toUpperCase()} · ${endpoint.codec}${endpoint.bitrateKbps ? ` · ${endpoint.bitrateKbps} kbps` : ""}`
                  : "—"}
              </dd>
              <dt>Origin</dt>
              <dd>{endpoint ? new URL(endpoint.url).host : "No endpoint"}</dd>
              <dt>Discovered via</dt>
              <dd>{record ? DISCOVERY_LABEL[record.discovery] : "—"}</dd>
              <dt>Last browser check</dt>
              <dd>
                {endpoint
                  ? `${endpoint.evidence.checkedAt} · ${endpoint.evidence.decodedBytes.toLocaleString()} bytes decoded · ${endpoint.evidence.sustainedSeconds}s sustained`
                  : "—"}
              </dd>
              <dt>Rights</dt>
              <dd>{record ? RIGHTS_STATUS_LABEL[record.rights] : "Not reviewed"}</dd>
              {station.officialWebsite ? (
                <>
                  <dt>Official site</dt>
                  <dd>
                    <a href={station.officialWebsite} rel="noreferrer noopener" target="_blank">
                      {station.officialWebsite.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>

            {record && record.limitations.length > 0 ? (
              <div className="stream-panel__notes">
                <p className="small">Known limitations</p>
                <ul className="small muted">
                  {record.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="detail-cols">
        <div>
          {!isReal ? (
            <section className="block">
              <SectionHeader title="Sample schedule" subtitle="Invented for the demo catalogue — not a real broadcast log" />
              <div className="episode-list">
                {DEMO_SCHEDULE.map((slot, index) => (
                  <div key={slot.time} className="episode-row">
                    <div className="episode-row__index">{slot.time}</div>
                    <div>
                      <h3 className="episode-row__title">{slot.show}</h3>
                      <p className="episode-row__desc">{slot.detail}</p>
                      <div className="episode-row__meta">{index === 0 ? <Badge tone="live">On air (demo)</Badge> : <span>Later today</span>}</div>
                    </div>
                    <div className="episode-row__actions">
                      <PlayPauseButton item={item} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="block">
            <SectionHeader title="About this station" />
            <p className="muted" style={{ lineHeight: 1.7, maxWidth: "70ch" }}>
              {station.description}
            </p>
            <p className="small muted" style={{ maxWidth: "70ch" }}>
              Broadcast in {station.languages.map((code) => LANGUAGE_LABELS[code] ?? code).join(" and ")}, covering{" "}
              {station.categories.map((category) => CATEGORY_LABELS[category].toLowerCase()).join(" and ")}.
            </p>
            {isReal ? (
              <p className="notice" style={{ marginTop: 16 }}>
                <strong>No programme schedule shown.</strong> This station does not publish a machine-readable schedule we have verified, and
                inventing one would mislead listeners. Recently played songs are not claimed either — the stream publishes no track metadata.
              </p>
            ) : (
              <p className="notice" style={{ marginTop: 16 }}>
                <strong>Demo station.</strong> This is fictional sample content. Playback is simulated: the player runs, but no audio is fetched
                from any broadcaster.
              </p>
            )}
          </section>
        </div>

        <aside className="side-panel">
          <h2>Similar stations</h2>
          <div className="stack">
            {similar.map((candidate) => (
              <StationTile key={candidate.id} station={candidate} />
            ))}
          </div>
          <div className="divider" />
          <h2>Station facts</h2>
          <dl className="small muted" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", margin: 0 }}>
            <dt>Frequency</dt>
            <dd style={{ margin: 0 }}>{station.frequency ?? "Not verified"}</dd>
            <dt>City</dt>
            <dd style={{ margin: 0 }}>{station.city}</dd>
            <dt>Region</dt>
            <dd style={{ margin: 0 }}>{REGION_LABELS[station.region]}</dd>
            <dt>Languages</dt>
            <dd style={{ margin: 0 }}>{station.languages.map((code) => LANGUAGE_LABELS[code] ?? code).join(", ")}</dd>
            <dt>Format</dt>
            <dd style={{ margin: 0 }}>{station.categories.map((category) => CATEGORY_LABELS[category]).join(", ")}</dd>
            <dt>Source</dt>
            <dd style={{ margin: 0 }}>{isReal ? "Real broadcaster" : "Demo catalogue"}</dd>
          </dl>
        </aside>
      </div>
    </>
  );
}
