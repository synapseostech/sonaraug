"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Artwork } from "@kito/ui";
import { CONTENT_CATEGORIES } from "@kito/studio";
import {
  ActionRow,
  DemoBadge,
  Field,
  LinkButton,
  Notice,
  PageHead,
  Panel,
  ReviewPill,
  TextArea,
  TextInput,
  ToggleChips,
} from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

const LANGUAGES = ["English", "Luganda", "Runyankole", "Acholi", "Ateso", "Lusoga", "Swahili"] as const;

export default function PodcastsPage() {
  const studio = useStudio();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>(["Society & Culture"]);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [hosts, setHosts] = useState(studio.actor.name);
  const [error, setError] = useState<string | null>(null);

  const shows = studio.state.shows;

  const toggle = (list: string[], setter: (next: string[]) => void, value: string) => {
    setter(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  };

  const create = () => {
    if (title.trim().length < 3) {
      setError("Give the show a title of at least 3 characters.");
      return;
    }
    if (description.trim().length < 20) {
      setError("Write a description of at least 20 characters — reviewers need it.");
      return;
    }
    if (categories.length === 0) {
      setError("Select at least one category.");
      return;
    }
    const show = studio.createShow({
      title: title.trim(),
      description: description.trim(),
      categories,
      languages,
      hosts: hosts.split(",").map((entry) => entry.trim()).filter(Boolean),
    });
    setError(null);
    router.push(`/studio/podcasts/${show.slug}`);
  };

  return (
    <>
      <PageHead
        title="My podcasts"
        description="Shows belong to your channel. A show must be approved by a reviewer before any of its episodes can publish."
        actions={
          <button type="button" className="kt-btn kt-btn--primary kt-btn--sm" onClick={() => setCreating((value) => !value)}>
            {creating ? "Close" : "Create a show"}
          </button>
        }
      />

      {creating ? (
        <Panel title="New show" subtitle="You can change everything later — including artwork and hosts.">
          <div className="ws-form-grid">
            <Field label="Show title" htmlFor="show-title">
              <TextInput id="show-title" value={title} onChange={setTitle} placeholder="e.g. Kampala Conversations" />
            </Field>
            <Field label="Hosts" htmlFor="show-hosts" hint="Comma-separated names">
              <TextInput id="show-hosts" value={hosts} onChange={setHosts} />
            </Field>
          </div>
          <Field label="Description" htmlFor="show-desc" hint="What is the show about, and who is it for?">
            <TextArea id="show-desc" value={description} onChange={setDescription} rows={3} />
          </Field>
          <Field label="Categories">
            <ToggleChips options={CONTENT_CATEGORIES} selected={categories} onToggle={(value) => toggle(categories, setCategories, value)} />
          </Field>
          <Field label="Languages">
            <ToggleChips options={LANGUAGES} selected={languages} onToggle={(value) => toggle(languages, setLanguages, value)} />
          </Field>
          {error ? (
            <p className="ws-field__error" role="alert">
              {error}
            </p>
          ) : null}
          <ActionRow>
            <button type="button" className="kt-btn kt-btn--primary kt-btn--sm" onClick={create}>
              Create show
            </button>
            <button type="button" className="kt-btn kt-btn--ghost kt-btn--sm" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </ActionRow>
        </Panel>
      ) : null}

      <Panel title={`${shows.length} shows`} subtitle="Only approved shows can publish episodes">
        <div className="ws-stack">
          {shows.map((show) => {
            const episodes = studio.episodesFor(show.id);
            const published = episodes.filter((episode) => episode.publicationStatus === "published").length;
            return (
              <div key={show.id} className="ws-row">
                <div style={{ width: 64 }}>
                  <Artwork seed={show.artworkSeed} title={show.title} />
                </div>
                <div className="ws-row__body">
                  <Link href={`/studio/podcasts/${show.slug}`} className="ws-row__title" style={{ textDecoration: "none" }}>
                    {show.title}
                  </Link>
                  <p className="ws-row__sub">
                    {episodes.length} episodes · {published} published · {show.categories.join(", ")}
                  </p>
                </div>
                <div className="ws-row__meta">
                  <ReviewPill status={show.reviewStatus} />
                  <LinkButton href={`/studio/podcasts/${show.slug}`}>Manage</LinkButton>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Notice>
        <strong>Demo channel.</strong> {studio.channel?.name} is a fictional creator account. Artwork is generated from a colour seed rather
        than copied, so no copyrighted cover art is used. <DemoBadge />
      </Notice>
    </>
  );
}
