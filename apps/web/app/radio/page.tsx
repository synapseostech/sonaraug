"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Artwork, Badge, Button, Chip, EmptyState, PlayIcon, SectionHeader } from "@kito/ui";
import { StationStatusBadge, StationTile } from "../../components/cards.tsx";
import {
  CATEGORY_LABELS,
  LANGUAGE_LABELS,
  REGION_LABELS,
  type Category,
  type Region,
  type Station,
} from "../../lib/data/catalogue.ts";
import {
  demoStations,
  featuredStation,
  realStations,
  stationCategories,
  stationLanguages,
  stationRegions,
  stations,
  verifiedStations,
} from "../../lib/data/queries.ts";

import { MARKETS, marketFor } from "@kito/studio";
import type { CountryCode } from "@kito/studio";
import { formatCount } from "../../lib/format.ts";
import { stationPlayable } from "../../lib/playables.ts";
import { usePlayer } from "../../lib/player.tsx";

type Collection = "all" | "verified" | "demo";

/** Search + facet predicate, shared by both sections so counts never disagree. */
function matches(station: Station, term: string, region: Region | "all", language: string, category: Category | "all"): boolean {
  if (region !== "all" && station.region !== region) return false;
  if (language !== "all" && !station.languages.includes(language)) return false;
  if (category !== "all" && !station.categories.includes(category)) return false;
  if (!term) return true;
  return [station.name, station.city, station.tagline, station.description, station.frequency ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

export default function RadioPage() {
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");
  const [language, setLanguage] = useState<string>("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [collection, setCollection] = useState<Collection>("all");
  const [market, setMarket] = useState<CountryCode>("UG");

  const term = query.trim().toLowerCase();
  const filtered = useMemo(
    () => stations.filter((station) => matches(station, term, region, language, category)),
    [term, region, language, category],
  );

  const verifiedResults = filtered.filter((station) => station.origin === "broadcaster");
  const demoResults = filtered.filter((station) => station.origin === "demo");
  const showVerified = collection !== "demo";
  const showDemo = collection !== "verified";

  const filtersActive = region !== "all" || language !== "all" || category !== "all" || term.length > 0;
  const featured = stationPlayable(featuredStation);
  const featuredLive = featured.live;

  const clearFilters = () => {
    setQuery("");
    setRegion("all");
    setLanguage("all");
    setCategory("all");
    setCollection("all");
  };

  return (
    <>
      <div className="filters" style={{ marginBottom: 0 }}>
        <div className="filters__row">
          <span className="filters__label">Market</span>
          {MARKETS.map((entry) => (
            <Chip key={entry.code} active={market === entry.code} onClick={() => setMarket(entry.code)}>
              {entry.name}
              {entry.live ? ` (${entry.code === "UG" ? stations.length : 0})` : " — planned"}
            </Chip>
          ))}
        </div>
      </div>

      {market !== "UG" ? (
        <section className="panel" aria-live="polite">
          <h2 className="section__title">{marketFor(market).name} is not open yet</h2>
          <p className="muted" style={{ maxWidth: "70ch" }}>
            The directory model already carries this market — {marketFor(market).regions.length} regions and{" "}
            {marketFor(market).languages.length} broadcast languages — but there are no stations in it. We have not contacted or verified a
            single broadcaster in {marketFor(market).name}, so nothing is listed rather than inventing entries.
          </p>
          <p className="muted" style={{ maxWidth: "70ch" }}>
            Opening a market means running the same broadcaster onboarding and stream verification used for Uganda: an authorised submission,
            at least one endpoint that passes a platform check, and an explicit rebroadcast authorisation.
          </p>
          <p className="muted" style={{ marginTop: 12, maxWidth: "70ch" }}>
            <strong>Regions modelled:</strong> {marketFor(market).regions.join(", ")}.
          </p>
          <p className="muted" style={{ maxWidth: "70ch" }}>
            <strong>Languages modelled:</strong> {marketFor(market).languages.join(", ")}.
          </p>
          <p className="muted" style={{ maxWidth: "70ch" }}>
            Uganda is the only market with any records in this build. Switching back shows {stations.length} Ugandan entries, of which {verifiedStations.length} are real broadcasters with a verified stream.
          </p>
        </section>
      ) : null}

      {market !== "UG" ? null : (
      <section className="hero">
        <div>
          <p className="hero__eyebrow">
            {featured.audioUrl ? <Badge tone="live">Verified live</Badge> : <Badge tone="demo">Awaiting authorisation</Badge>} Radio directory
          </p>
          <h1 className="hero__title">{featuredStation.name}</h1>
          <p className="hero__desc">
            {featuredStation.tagline} {featuredStation.frequency ? `Broadcasting on ${featuredStation.frequency} from ${featuredStation.city}.` : `Broadcasting from ${featuredStation.city}.`}
          </p>
          <div className="hero__actions">
            <Button variant="primary" onClick={() => player.play(featured)} disabled={!featured.audioUrl}>
              <PlayIcon size={15} /> {!featured.audioUrl ? "Playback awaiting authorisation" : player.isCurrent(featured.key) && player.status === "playing" ? "Pause live radio" : "Listen live"}
            </Button>
            <Link href={`/radio/${featuredStation.slug}`} className="kt-btn kt-btn--secondary">
              Open station
            </Link>
          </div>
          <div className="hero__meta">
            <span>{CATEGORY_LABELS[featuredStation.categories[0] ?? "talk"]}</span>
            <span>·</span>
            <span>{featuredStation.languages.map((code) => LANGUAGE_LABELS[code] ?? code).join(" & ")}</span>
            <span>·</span>
            <span>{featuredLive?.bitrateKbps ? `${featuredLive.bitrateKbps} kbps MP3` : "Live stream"}</span>
            <span>·</span>
            <span>{verifiedStations.length} verified stations</span>
          </div>
        </div>
        <div className="hero__art">
          <Artwork seed={featuredStation.id} title={featuredStation.name} shape="round" />
        </div>
      </section>
      )}

      <div className="filters" style={market === "UG" ? undefined : { display: "none" }}>
        <div className="filters__row">
          <label className="filters__label" htmlFor="station-search">
            Search
          </label>
          <input
            id="station-search"
            className="searchbox"
            style={{ flex: 1, maxWidth: 320, height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid var(--kt-border)", background: "var(--kt-bg)", color: "var(--kt-text)" }}
            placeholder="Station, city or frequency"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="filters__results">
            {filtered.length} of {stations.length} stations
          </span>
        </div>

        <div className="filters__row">
          <span className="filters__label">Show</span>
          <Chip active={collection === "all"} onClick={() => setCollection("all")}>
            Everything
          </Chip>
          <Chip active={collection === "verified"} onClick={() => setCollection("verified")}>
            Real stations ({realStations.length})
          </Chip>
          <Chip active={collection === "demo"} onClick={() => setCollection("demo")}>
            Demo catalogue ({demoStations.length})
          </Chip>
        </div>

        <div className="filters__row">
          <span className="filters__label">Region</span>
          <Chip active={region === "all"} onClick={() => setRegion("all")}>
            All
          </Chip>
          {stationRegions().map((value) => (
            <Chip key={value} active={region === value} onClick={() => setRegion(value)}>
              {REGION_LABELS[value]}
            </Chip>
          ))}
        </div>

        <div className="filters__row">
          <span className="filters__label">Language</span>
          <Chip active={language === "all"} onClick={() => setLanguage("all")}>
            All
          </Chip>
          {stationLanguages().map((value) => (
            <Chip key={value} active={language === value} onClick={() => setLanguage(value)}>
              {LANGUAGE_LABELS[value] ?? value.toUpperCase()}
            </Chip>
          ))}
        </div>

        <div className="filters__row">
          <span className="filters__label">Category</span>
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </Chip>
          {stationCategories().map((value) => (
            <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
              {CATEGORY_LABELS[value]}
            </Chip>
          ))}
          {filtersActive || collection !== "all" ? (
            <button type="button" className="filters__clear" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {market !== "UG" ? null : filtered.length === 0 ? (
        <EmptyState
          title="No stations match those filters"
          description="Try a wider region or clear the language and category filters."
          action={
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : null}

      {market === "UG" && showVerified && verifiedResults.length > 0 ? (
        <>
          <SectionHeader
            title="Real Ugandan stations"
            subtitle="Streams read from each broadcaster's own player or station API, then tested for actual browser playback"
          />
          <div className="grid grid--stations">
            {verifiedResults.map((station) => (
              <StationTile key={station.id} station={station} />
            ))}
          </div>
        </>
      ) : null}

      {market === "UG" && showDemo && demoResults.length > 0 ? (
        <>
          <SectionHeader
            title="Demo catalogue"
            subtitle="Fictional stations used to exercise filters, artwork and the player — no audio is fetched for these"
          />
          <div className="grid grid--stations">
            {demoResults.map((station) => (
              <StationTile key={station.id} station={station} />
            ))}
          </div>
        </>
      ) : null}

      {market === "UG" && showVerified ? (
        <section className="block" aria-label="Stream status legend">
          <SectionHeader title="How to read the badges" />
          <ul className="legend">
            <li>
              <Badge tone="live">Verified live</Badge>
              <span>Stream decoded in a real browser during integration. Pressing play should produce audio.</span>
            </li>
            <li>
              <Badge tone="demo">Temporarily unavailable</Badge>
              <span>Was playable at the last check but is not responding now. The station stays listed and its details remain reachable.</span>
            </li>
            <li>
              <Badge tone="demo">Unsupported in browser</Badge>
              <span>The endpoint answers, but no browser can decode it as served. Play is disabled rather than failing after the click.</span>
            </li>
            <li>
              <Badge tone="neutral">Not verified</Badge>
              <span>No working endpoint has been discovered, so nothing is claimed either way.</span>
            </li>
            <li>
              <Badge tone="demo">Demo</Badge>
              <span>Fictional catalogue entry for interface testing.</span>
            </li>
          </ul>
        </section>
      ) : null}

      {market !== "UG" ? null : (
      <p className="notice" style={{ marginTop: 28 }}>
        <strong>What is real here.</strong> Stations marked <em>verified live</em> are real Ugandan broadcasters: the endpoint comes from
        the broadcaster&apos;s own site or station API and was confirmed playing audio in a browser on 2026-11-22. Stations marked{" "}
        <em>demo</em> are fictional sample content. No listener counts are measured — figures shown for demo stations are invented sample
        values, and real stations show none.
        {verifiedStations.length === 0
          ? " Playback is currently off for every real station: stream evidence is not a retransmission licence, and no broadcaster authorisation has been recorded yet."
          : null}
      </p>
      )}
    </>
  );
}
