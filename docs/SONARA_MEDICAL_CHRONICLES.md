# Medical Chronicles

**Updated:** 2026-11-23 · Sonara-owned educational audio on medicine and health, inside the Podcasts section of the product. Initial programmes are largely NotebookLM Audio Overviews.

## 1. Listener experience (implemented)

| Route | What it shows |
|---|---|
| `/medical-chronicles` | Hero with search and filters, educational disclaimer, featured series, recently published, most played (only when real play data exists), free and premium episodes, topics, specialties |
| `/medical-chronicles/categories` | All active topics and specialties with series and episode counts |
| `/medical-chronicles/category/[slug]` | Series and episodes in one category; 404 for unknown or inactive categories |
| `/medical-chronicles/series/[slug]` | Series detail, "first N free" badge, episodes in published order with Free / Included / Premium markers, disclaimer, related series |
| `/medical-chronicles/[episodeSlug]` | Episode: description, AI disclosure, **editorial record** (approved; separate medical review with reviewer and date, if any; corrections), references, content notes, transcript (only when the listener may play), corrections, player panel or paywall, previous/next, related |
| `/medical-chronicles/search` | Full-text over titles, descriptions, series and reference titles; topic and free/premium filters |
| `/medical-chronicles/subscribe` | What is free, what a subscription adds, plans |

Withdrawn episodes keep a public page that says they were withdrawn and why, with no audio. Unpublished episodes are 404 for the public and shown to staff with a "Staff preview" banner.

## 2. Content model

Series: title, slug, description, topic and specialty (from admin-managed categories), host, author/editor, status (draft/published/archived), subscription requirement, free-episode allowance (blank = platform default, initially 2), publication date, related series, SEO title/description. Cover artwork is generated from the series id until image upload lands (roadmap).

Episode: title, slug, description, season, episode number (drives order and so the free allowance), duration, transcript, references (`Title | https://link | citation`, at least one required), content notes, **AI disclosure** (AI-generated / AI-assisted / produced by people; required), free/premium override, download flag (stored, downloads not offered yet), related episodes, one audio source, editorial status, version, approval, publication/schedule date, withdrawal reason, last medical review (who, when).

Categories are data, seeded with the 14 requested (Anatomy … Medical Research), and administrators add, rename, re-type, reorder and deactivate them at `/admin/medical-chronicles/categories`.

## 3. Audio sources (provider registry)

Defined once in `packages/chronicles/src/sources.ts`. Anything not in the registry is rejected.

| Source | Validation | Playback | Progress | Notes |
|---|---|---|---|---|
| **NotebookLM share link** | https only; host exactly `notebooklm.google.com`; path `/notebook/<id>[/<section>]`; credentials, ports and lookalike hosts rejected; `authuser`/`pli`/`hl` stripped | **Provider-controlled**: "Listen on NotebookLM" opens a new tab (`rel="noopener noreferrer"`) | Not tracked; history records "Played on NotebookLM" | Never iframed, never scraped, no undocumented API. Works only if the notebook is shared publicly in NotebookLM; Google's permissions apply. |
| **Uploaded audio** | Admin/editor only; ≤ 300 MB (configurable); container identified from **magic bytes** (MP3, AAC, M4A, OGG, WAV, WebM audio), not the filename; SHA-256 recorded | **Sonara player**: seek, speed, resume, next | Yes | Served by `/api/media/[id]?e=<episode>` after the same access check, with HTTP Range, `Cache-Control: private, no-store`. Development storage is local disk. |
| **Authorised audio URL** | https; host must be on the admin allow-list (Settings); IP literals, `localhost`, non-443 ports rejected | Sonara player | Yes | The URL is revealed only after the access check, but once revealed it can be shared; prefer uploads for premium content. |

"Unavailable" handling: an editor marks a source *unavailable* or *withdrawn* with a note; listeners then see "Audio unavailable" and the note instead of the link or player. Sonara does not automatically probe NotebookLM links: a request to Google would show its sign-in page whether or not the share works, so an automatic check would be misleading.

**Important for premium NotebookLM content:** anyone who obtains a public NotebookLM share link can open it without Sonara. Sonara only reveals the link to entitled listeners, but cannot stop onward sharing. Use uploaded audio for content that must stay behind the paywall.

## 4. Free and premium access

Rule (server: `decideEpisodeAccess`; database: `app_private.mc_episode_tier` / `can_access_mc_episode`):
1. A series that does not require a subscription is entirely free.
2. Otherwise the first **N** *publicly live* episodes, ordered by season, episode number, publish time and id, are free; N is the series allowance or the platform default (2).
3. An episode override ("always free" / "always premium") beats position. The allowance counts positions: making episode 2 premium does **not** make episode 3 free.
4. Drafts, scheduled-but-not-yet-live and withdrawn episodes take no position, so withdrawing episode 1 frees the next one in order.
5. Premium needs an active listener entitlement (subscription incl. grace, or an audited grant; an audited suspension overrides payment). Creator plans never count.
6. Optional platform setting: free episodes require a (free) account.

Enforcement points: episode page (what is rendered), `POST /api/chronicles/episodes/[id]/playback` (re-checked when Play is pressed), `GET /api/media/[id]` (re-checked on every byte-range request; the episode id must match the asset). Manipulating URLs, swapping episode ids or replaying a subscriber's media URL from another account returns 403 (tested).

## 5. Editorial integrity

Workflow: draft → in review → (changes requested) → approved → published / scheduled → withdrawn → reopened as draft.

- **No self-approval**: whoever last edited or submitted an episode cannot approve or publish it (UI hides it; service refuses; DB trigger refuses).
- **Current-version approval**: editing after approval sends the episode back to draft; publishing checks the approved version equals the current version.
- **Submission checklist**: audio source, at least one reference, AI disclosure, description.
- **Corrections**: editing a live episode requires a public correction note; it is versioned and listed on the episode page.
- **Version history**: every save stores a full snapshot with editor and note.
- **Medical review is separate from publishing**: a reviewer can record "what was reviewed" (e.g. "doses checked against Uganda Clinical Guidelines 2023"); the episode page then shows the reviewer and date. Without it, the page says no separate medical review has been recorded. Publishing never implies clinical verification.
- **Disclaimers**: an educational-content notice on every Medical Chronicles page; an AI notice on AI-generated/assisted episodes.
- **Withdrawal / takedown**: reviewer action with a public reason; audio stops immediately.
- Roles: `content_editor` (draft, edit, submit), `medical_reviewer` (also review, approve, publish, withdraw, record medical review, change access rules), admins (all, plus categories). Every action is audited.

## 6. Publishing a NotebookLM episode with study materials (operator steps)

Updated 2026-11-26. One NotebookLM notebook (e.g. *Intestinal obstruction*) becomes one Sonara episode: its Audio Overview plays in the Sonara player, and its Studio flashcards and quiz become an interactive **Study studio** on the episode page. Listeners never leave Sonara.

1. **In NotebookLM** — generate the Audio Overview, then in the Audio Overview's ⋮ menu choose **Download**. In the Studio panel, generate Flashcards and a Quiz.
2. **Create the episode** — `/admin/medical-chronicles/series/new` (or open a series) → **Add episode** → title, number, description, references, AI disclosure "AI-generated" → **Create draft episode**.
3. **Audio source** → **Uploaded audio (recommended)** → choose the downloaded file. On the Supabase backend the file goes straight from the browser to the private `mc-audio` bucket (no size problem on Vercel), then the server checks its real format, size and sha256. → **Save audio source**. A NotebookLM share link is still accepted (`notebooklm.google.com/notebook/…` or `notebooklm.link.google/…`), but listeners then leave Sonara and the link can be passed around the paywall.
4. **Study materials (NotebookLM Studio)** → paste the flashcards and the quiz. NotebookLM has no API that lets another site read them, so they are copied across as text. Accepted formats:
   - Flashcards: `Q: … / A: …` blocks, `front<TAB>back` lines, `front :: back`, or JSON `[{"front","back"}]`.
   - Quiz: numbered questions with `A) … B) …` options and `Answer: B` (or the correct option marked with `*` / `✓`), optional `Explanation: …`; or JSON.
   - Easiest: open the **Prompt for NotebookLM chat** under each box, copy it into the notebook's chat, and paste the answer back. The preview counts what was recognised and lists anything that needs fixing (a card with no answer, a question with no or two correct answers); saving is blocked until it is clean, and the server parses it again.
   → **Save study materials**. Like any substantive change, this creates a new version; on a live episode it needs a correction note.
5. **Submit for review**. A *different* reviewer opens it, optionally records a medical review, **Approve**, then **Publish** (or schedule). Make sure the series itself is published.

What listeners get: free episodes show the Study studio to everyone allowed to listen; on premium episodes, non-subscribers see only "This episode comes with N flashcards and a M-question quiz" with a subscribe button. In Supabase the material lives in `mc_episode_study`, which has **no public read policy**; listeners get it only through `mc_episode_study_for()`, which applies the same access rule as the audio (migration 0200, DB suite 12). Flashcard "known" marks and best quiz scores are kept in the listener's browser only.

### Study notes and the AI tutor (Groq) — subscribers only

- **Notes:** in *Study materials*, load a `.md` file (or paste Markdown) into **Study notes**, then **Save study materials**. Subscribers read them in the episode's **Notes** tab, rendered by Sonara (headings, lists, bold, tables, code; never raw HTML). Max 200,000 characters.
- **AI tutor:** subscribers get an **AI tutor** tab: *Multiple choice* (5 or 10 fresh questions per click, three levels, instant marking with explanations) and *Viva* (a short-answer question; the learner types an answer and gets correct/partly right/not quite, feedback and a model answer). The tutor is given **only** the episode's notes and is told not to go beyond them.
- **Draft quiz from notes with Groq** (editors): writes 10 questions from the notes into the quiz box for review. Nothing is saved until you press Save, and the medical review is still yours.
- **Who gets what:** flashcards and the pasted quiz follow the episode's free/premium rule. Notes and the AI tutor need an **active listener subscription** (or a Medical Chronicles staff role) on every episode, free ones included. Enforced three times: the page, the `/api/chronicles/episodes/[id]/tutor` route, and the database (`mc_episode_study_for()` blanks `notes_md` for non-subscribers; migration 0210, DB suite 12).
- **Configuration:** `GROQ_API_KEY` (server-only; create it at console.groq.com). Optional `GROQ_MODEL` (default `openai/gpt-oss-120b`; must support Groq's JSON object mode). Without a key the tutor tab and draft button are hidden or disabled; nothing else changes.
- **Cost and abuse:** each subscriber gets up to 60 tutor calls per hour (`tutor:user` rate limit). Each call sends at most ~60,000 characters of notes.
- **Privacy:** Groq receives the episode title, the notes and, when marking, the question and the learner's typed answer. Never a name, email, account id or IP address.

## 7. Not done yet

Cover-image upload; downloads; listener reports of broken links (support email for now); comments; RSS for Medical Chronicles; analytics beyond play starts; server-side quiz results and spaced repetition across devices.
