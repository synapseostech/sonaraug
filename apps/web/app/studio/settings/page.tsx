"use client";

import { useState } from "react";
import { MARKETS, marketFor } from "@kito/studio";
import type { CountryCode } from "@kito/studio";
import { Field, Notice, PageHead, Panel, Select, Stat, TextArea, TextInput, ToggleChips } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

export default function ChannelSettingsPage() {
  const studio = useStudio();
  const channel = studio.channel;
  const [message, setMessage] = useState<string | null>(null);

  if (!channel) {
    return (
      <>
        <PageHead title="Channel settings" />
        <Notice tone="warn">No channel is attached to this actor. Reset the demo data to restore it.</Notice>
      </>
    );
  }

  const market = marketFor(channel.country);
  const shows = studio.state.shows;
  const episodes = studio.state.episodes;

  const patch = (fields: Parameters<typeof studio.updateChannel>[0]) => {
    studio.updateChannel(fields);
    setMessage("Channel settings saved locally.");
  };

  return (
    <>
      <PageHead
        title="Channel settings"
        description="Your creator identity across podcasts and video. These are local records — no account system exists in this build."
      />

      {message ? <Notice tone="ok">{message}</Notice> : null}

      <div className="ws-split">
        <Panel title="Channel" subtitle="Shown to reviewers and, in a production build, on your public page">
          <div className="ws-form">
            <Field label="Channel name" hint="3 characters minimum">
              <TextInput value={channel.name} onChange={(value) => (value.trim().length >= 3 ? patch({ name: value }) : undefined)} />
            </Field>
            <Field label="Public slug" hint="Used in URLs once hosting exists">
              <TextInput
                value={channel.slug}
                onChange={(value) => patch({ slug: value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              />
            </Field>
            <Field label="Channel type">
              <Select
                value={channel.kind}
                onChange={(value) => patch({ kind: value as typeof channel.kind })}
                options={[
                  { value: "podcast", label: "Podcast only" },
                  { value: "video", label: "Video only" },
                  { value: "both", label: "Podcasts and video" },
                ]}
              />
            </Field>
            <Field label="Bio" hint="At least 20 characters — reviewers read this">
              <TextArea rows={4} value={channel.bio} onChange={(value) => patch({ bio: value })} />
            </Field>
            <Field label="Country">
              <Select
                value={channel.country}
                onChange={(value) => patch({ country: value as CountryCode })}
                options={MARKETS.map((entry) => ({ value: entry.code, label: entry.name }))}
              />
            </Field>
            <Field label="Languages">
              <ToggleChips
                options={market.languages}
                selected={channel.languages}
                onToggle={(value) =>
                  patch({
                    languages: channel.languages.includes(value)
                      ? channel.languages.filter((entry) => entry !== value)
                      : [...channel.languages, value],
                  })
                }
              />
            </Field>
          </div>
          <p className="ws-row__sub">
            Artwork is generated from the channel seed <code>{channel.avatarSeed}</code>. Uploading real artwork needs tenant-scoped object
            storage with signed URLs, which is not part of this phase.
          </p>
        </Panel>

        <Panel title="Acting identity" subtitle="Simulated roles for testing workflows">
          <div className="ws-form">
            <Field label="Display name">
              <TextInput value={studio.actor.name} onChange={(value) => studio.setRole(studio.actor.role, value)} />
            </Field>
            <Field label="Role" hint="Creator and broadcaster roles have deliberately limited powers">
              <Select
                value={studio.actor.role}
                onChange={(value) => studio.setRole(value as typeof studio.actor.role)}
                options={[
                  { value: "creator", label: "Creator" },
                  { value: "broadcaster", label: "Broadcaster" },
                  { value: "reviewer", label: "Reviewer" },
                  { value: "admin", label: "Administrator" },
                ]}
              />
            </Field>
          </div>
          <Notice tone="info">
            <strong>No authentication.</strong> Roles are a local switch so you can test that a creator cannot approve their own episode and a
            broadcaster cannot verify their own stream. Real authorisation must come from Supabase Auth with row-level security — not from a
            dropdown.
          </Notice>
          <div className="ws-stats ws-stats--tight">
            <Stat label="Shows" value={shows.length} />
            <Stat label="Episodes" value={episodes.length} />
            <Stat label="Followers (demo)" value={channel.followersDemo.toLocaleString()} hint="Placeholder" />
          </div>
        </Panel>
      </div>

      <Panel title="What this channel does not have" subtitle="Stated explicitly so nothing here is mistaken for a working platform">
        <ul className="ws-list">
          <li>No public channel page: the listener app shows the demo catalogue, not your drafts.</li>
          <li>No podcast hosting, no RSS hosting, no media storage and no delivery network.</li>
          <li>No payouts, sponsorship or revenue reporting — advertising is out of scope for this phase.</li>
          <li>No account recovery, email verification or multi-user access to the channel.</li>
        </ul>
      </Panel>
    </>
  );
}
