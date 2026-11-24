"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GENRES, MARKETS, marketFor } from "@kito/studio";
import type { CountryCode, StationSubmission } from "@kito/studio";
import {
  DataTable,
  DemoBadge,
  EmptyHint,
  Field,
  Notice,
  PageHead,
  Panel,
  Select,
  Stat,
  StatusPill,
  TextArea,
  TextInput,
  ToggleChips,
} from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

export default function StationOnboardingPage() {
  const studio = useStudio();
  const router = useRouter();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("");
  const [country, setCountry] = useState<CountryCode>("UG");
  const [region, setRegion] = useState("Central");
  const [city, setCity] = useState("Kampala");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [genres, setGenres] = useState<string[]>(["Talk"]);
  const [error, setError] = useState<string | null>(null);

  const market = marketFor(country);
  const submissions = studio.state.submissions;
  const approved = submissions.filter((entry) => entry.status === "approved").length;
  const awaiting = submissions.filter((entry) => ["submitted", "under_review", "changes_requested"].includes(entry.status)).length;

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const create = () => {
    if (name.trim().length < 3) {
      setError("Enter the station's name (3 characters minimum).");
      return;
    }
    if (genres.length === 0) {
      setError("Select at least one genre so listeners can find the station.");
      return;
    }
    if (languages.length === 0) {
      setError("Select at least one broadcast language.");
      return;
    }
    const created = studio.createSubmission({
      name: name.trim(),
      frequency: frequency.trim() || null,
      country,
      region,
      city: city.trim() || region,
      website: website.trim() || null,
      description: description.trim(),
      languages,
      genres,
    });
    router.push(`/studio/broadcast/${created.id}`);
  };

  const columns: readonly Column<StationSubmission>[] = [
    {
      key: "station",
      header: "Station",
      render: (submission) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {submission.name}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {submission.frequency ?? "frequency not supplied"} · {submission.city}, {submission.region} · {marketFor(submission.country).name}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Submission", width: "160px", render: (submission) => <StatusPill kind="station" value={submission.status} /> },
    {
      key: "streams",
      header: "Streams",
      width: "110px",
      render: (submission) => {
        const healthy = submission.streams.filter((stream) => stream.health === "healthy").length;
        return (
          <span className="ws-row__sub">
            {healthy}/{submission.streams.length} healthy
          </span>
        );
      },
    },
    {
      key: "permission",
      header: "Integration",
      width: "150px",
      render: (submission) => <StatusPill kind="plain" value={submission.integrationPermission.replace(/_/g, " ")} />,
    },
    {
      key: "open",
      header: "",
      width: "90px",
      render: (submission) => (
        <a className="kt-btn kt-btn--secondary kt-btn--sm" href={`/studio/broadcast/${submission.id}`}>
          Manage
        </a>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Station onboarding"
        description="Register a station, supply authorised stream endpoints and evidence, then request verification from the platform team."
        actions={<DemoBadge />}
      />

      <Notice tone="info">
        <strong>How verification works here.</strong> A broadcaster can add endpoints and request a check, but cannot mark a stream healthy or
        approve a listing. Technical health and legal authorisation are recorded separately, and both are needed before a station is listable.
      </Notice>

      <div className="ws-stats">
        <Stat label="Submissions" value={submissions.length} hint="Including drafts" />
        <Stat label="Awaiting platform" value={awaiting} hint="Submitted, in review or changes requested" />
        <Stat label="Approved" value={approved} hint="Listing allowed" tone={approved > 0 ? "ok" : undefined} />
        <Stat label="Markets configured" value={MARKETS.length} hint={`${MARKETS.filter((entry) => entry.live).length} live`} />
      </div>

      <Panel title="Your submissions" subtitle="Every station you have registered in this workspace">
        <DataTable
          columns={columns}
          rows={submissions}
          empty={<EmptyHint title="No stations yet">Register your first station using the form below.</EmptyHint>}
        />
      </Panel>

      <Panel title="Register a station" subtitle="Creates a draft — nothing is published until the platform approves it">
        <div className="ws-form-grid">
          <Field label="Station name" htmlFor="st-name">
            <TextInput id="st-name" value={name} onChange={setName} placeholder="e.g. Rwenzori Voice FM" />
          </Field>
          <Field label="Frequency" hint="Leave blank if not on FM" htmlFor="st-frequency">
            <TextInput id="st-frequency" value={frequency} onChange={setFrequency} placeholder="e.g. 92.5 FM" />
          </Field>
          <Field label="Market">
            <Select
              value={country}
              onChange={(value) => {
                const next = marketFor(value as CountryCode);
                setCountry(next.code);
                setRegion(next.regions[0] ?? "National");
                setLanguages([next.languages[0] ?? "English"]);
              }}
              options={MARKETS.map((entry) => ({
                value: entry.code,
                label: entry.live ? `${entry.name} (live market)` : `${entry.name} (not launched)`,
              }))}
            />
          </Field>
          <Field label="Region">
            <Select value={region} onChange={setRegion} options={market.regions.map((value) => ({ value, label: value }))} />
          </Field>
          <Field label="City / town" htmlFor="st-city">
            <TextInput id="st-city" value={city} onChange={setCity} />
          </Field>
          <Field label="Official website" hint="Where you publish your own player" htmlFor="st-website">
            <TextInput id="st-website" value={website} onChange={setWebsite} placeholder="https://" />
          </Field>
        </div>

        <Field label="Description" hint="At least 20 characters — listeners see this on the station page" htmlFor="st-description">
          <TextArea id="st-description" rows={3} value={description} onChange={setDescription} placeholder="What the station covers, who presents, and who it serves." />
        </Field>

        <Field label="Languages">
          <ToggleChips options={market.languages} selected={languages} onToggle={(value) => setLanguages((current) => toggle(current, value))} />
        </Field>

        <Field label="Genres">
          <ToggleChips options={GENRES} selected={genres} onToggle={(value) => setGenres((current) => toggle(current, value))} />
        </Field>

        {error ? (
          <p className="ws-formerror" role="alert">
            {error}
          </p>
        ) : null}

        <div className="ws-actions">
          <button type="button" className="kt-btn kt-btn--primary" onClick={create}>
            Create draft submission
          </button>
        </div>
      </Panel>
    </>
  );
}
