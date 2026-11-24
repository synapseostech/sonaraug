# Product requirements — v0.1 (MVP)

Companion: `docs/product/backlog.md` (epics and stories), `docs/architecture/overview.md`.

## 1. Vision

One trusted Ugandan destination to discover, listen to and watch local media —
live radio, podcasts and video — on infrastructure we own, monetised by
advertising, ready to expand across East Africa without re-platforming.

**Differentiator:** reliability and local relevance, not catalogue size. Success
is measured by streams that start on a 3G connection in Gulu and a broadcaster
toolset a three-person station can actually use.

## 2. Launch market

Uganda only. English and Luganda first (Swahili and Runyankole next). Timezone
`Africa/Kampala`. Currency UGX. Primary devices: Android 8–13 on ≤3 GB RAM,
mid-range iPhones, and desktop web.

## 3. Personas

| Persona | Need | Success signal |
|---|---|---|
| **Aisha, 24, Kampala** — listener, 1.5 GB data/month | Radio starts fast, podcasts resume, low data use | Week-4 retention; sessions/week |
| **Brian, 31, Mbarara** — viewer | Video that rarely buffers; continue watching | Video completion rate |
| **Pastor Samuel, 48, Jinja** — station manager | Get listed without an engineer; know when the stream is down | Time-to-first-listen; stream uptime |
| **Grace, 29** — podcast creator | Import RSS, get discovered, see plays | Episodes published; plays/episode |
| **Ivan, 26** — video creator | Upload, captions, comments, a path to revenue | Uploads/month; watch time |
| **Nadia, 34** — media buyer | Book sponsored placements with provable delivery | Campaign renewal rate |
| **Internal admin (1–3 people)** | Verify, moderate, resolve reports quickly | Median moderation time |

## 4. Core journeys (acceptance-level)

1. **Anonymous listen** — open app → tap featured station → audio starts ≤3 s on
   3G → lock-screen controls work → stream drop recovers without user action.
2. **Register and personalise** — follow a station → prompted to sign in (email or
   phone OTP) → follow persists → Home shows "Your stations".
3. **Podcast return** — search → series → play → change speed → leave → next day
   resume at the exact position.
4. **Watch** — Home → video → captions → 480p default on cellular → save → later
   "continue watching".
5. **Broadcaster onboarding** — register organisation → submit verification →
   create station → register endpoint → automated probe marks it playable →
   record rights → publish → appears in directory after moderation.
6. **Creator publish** — channel → upload → schedule → appears in directory.
7. **Moderation** — listener reports a comment → moderator hides it → audit row
   written → reporter sees the outcome.
8. **Sponsored placement** — admin links a campaign creative to a placement with a
   date range → label renders on every surface → impressions recorded server-side.

## 5. Scope

**MVP in:** 5-tab listener app (Home, Radio, Podcasts, Watch, My Library),
universal player, search, accounts (incl. anonymous), favourites/follows/history/
resume, broadcaster self-service (station, streams, schedules, presenters),
creator self-service (podcast upload + RSS, video upload), moderation queue,
admin control centre, sponsored placements (manually scheduled), analytics v1.

**Deferred:** radio catch-up/recording, live video, audio ad insertion into
third-party streams, self-serve ad auction, automated payouts, DRM, offline video
downloads, multi-country/currency, social graph beyond follow, live chat, native
ad SDKs.

## 6. Non-functional targets

| Area | Target |
|---|---|
| Radio startup | ≤3 s p50, ≤8 s p95 on 3G |
| Audio rebuffer | <1% of listening minutes |
| Video startup | ≤4 s p75 at 480p |
| API latency | p95 <400 ms |
| Cold start | <2.5 s mid-range Android |
| Availability | 99.5% MVP, 99.9% post-launch |
| Data budget | audio 64–96 kbps default; video 480p default; artwork ≤300 KB |
| Accessibility | WCAG 2.2 AA web; 4.5:1 text; 48 dp targets; TalkBack/VoiceOver labels |

## 7. Acceptance criteria for MVP exit

1. 20 real Ugandan stations play reliably with lock-screen controls on Android 8+
   and iOS 15+.
2. A broadcaster can self-onboard and publish without engineering help.
3. A 200-episode RSS feed imports idempotently (rerun → 0 duplicates).
4. A 10-minute video upload becomes playable HLS with captions in ≤5 minutes.
5. Every tenant table has a passing RLS test for all six roles.
6. No secrets in client bundles; zero criticals from a security review.
7. Playback survives three forced network drops without user intervention.
8. Every sponsored surface renders a visible label; impressions are auditable.

## 8. Explicitly out of legal scope until confirmed

Radio retransmission, time-shift, and any music performance right depend on
per-station authorisation. See `docs/security/security-model.md` §Compliance and
`docs/security/copyright-and-rights.md`.
