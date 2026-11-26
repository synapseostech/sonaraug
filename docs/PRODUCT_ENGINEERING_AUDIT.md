# Product Engineering Audit

> **Superseded (2026-11-22)** by `SONARA_ENGINEERING_AUDIT.md`, `SONARA_FEATURE_STATUS.md`,
> `SONARA_SECURITY_STATUS.md`, `SONARA_TESTING_AND_ACCEPTANCE.md` and `SONARA_PRODUCT_ROADMAP.md`.
> Kept unchanged below for history. Its test counts (138 unit tests, 6 DB suites) predate migration 0110.

## Executive baseline

Date: 2026-11-22

The repository is a substantial monorepo prototype with a real listener web UI
and a tested domain foundation. It is not production-ready. The listener app
contains real radio endpoint evidence for a small set of Ugandan stations, while
podcasts, videos, analytics, creator workflows, broadcaster actions and admin
decisions are currently browser-local demonstrations. There are no committed
git revisions in the current repository, and all project files remain untracked.

## What is working

- pnpm/Turborepo monorepo, strict TypeScript, shared config and UI packages.
- Next.js listener web app with home, radio, podcasts, watch, search and library
  routes; workspace routes are also rendered inside the web app.
- 138 Node unit tests currently pass.
- Strict workspace typecheck currently passes after correcting one readonly-array
  test mutation.
- The Next.js web build completes and emits 27 routes.
- Local PostgreSQL migrations and RLS test infrastructure exist.
- Live radio uses the browser `HTMLAudioElement` with retry, reconnect and
  per-endpoint metadata for technically verified streams.
- Library state persists in browser `localStorage`.
- Creator, broadcaster and admin screens have complete-looking local workflows,
  validation helpers and review state.

## What is mock, local or simulated

- Podcast episodes and videos do not have hosted audio or video delivery.
- Studio and admin role switching has no authentication and is explicitly simulated.
- Studio data, media references, review decisions and moderation history live in
  browser `localStorage`, not Supabase or another shared database.
- Browser recording uses `MediaRecorder`, but recorded blobs remain local and are
  lost across reload because object URLs are runtime-only.
- Stream checks, station review, broadcast sessions and analytics figures are
  demo evidence or local UI workflows, not continuously operating services.
- `apps/mobile`, `apps/studio` and `apps/admin` are placeholders or much less
  complete than the routes implemented in `apps/web`.
- Podcast and video catalogue entries are sample data.

## Key risks and gaps

1. **Rights gate is P0.** The project owner reports written retransmission
   permission for the six registered broadcasters, but the documents have not
   been independently reviewed or stored in the repository. Music composition
   and sound-recording rights remain unconfirmed. The radio registry therefore
   blocks playback until both station permission and music rights are cleared.
2. **Authentication and RLS are not active in the web.** Mock role selection,
   local storage and TypeScript permissions cannot enforce production security.
3. **Microphone policy required alignment.** The recorder uses `getUserMedia`,
   so the web Permissions-Policy now allows microphone access for same-origin
   self flows; camera and geolocation remain blocked.
4. **Backend gaps.** No real auth, media upload/transcoding, RSS hosting, stream
   monitor, shared publication persistence or server-side moderation is wired
   into the product UI.
5. **No browser journey suite is present despite historical delivery claims.**
   Unit tests and Next builds do not cover responsive or end-to-end journeys.
6. **Security hardening remains incomplete.** CSP, rate limiting, secret scanning,
   restore drills and production session controls are not implemented.
7. **Home and catalogue copy must remain honest.** Genuine station metadata and
   browser playback evidence must be labelled separately from rights-authorised
   availability and from fabricated demo content.

## Prioritized implementation roadmap

### P0 — launch blockers

- Review and retain the reported broadcaster authorisations; confirm the
  platform's music-work and sound-recording rights before enabling public radio.
- Implement real authentication and server/database-enforced role boundaries.
- Remove or clearly isolate simulated role, publication and review actions.
- Complete microphone permission, privacy, CSP and rate-limit requirements.
- Wire a server-backed source of truth for catalogue, library and studio state.

### P1 — core product completeness

- Implement podcast audio upload, enclosure delivery and RSS imports.
- Implement video upload, transcoding, storage and authorised playback.
- Integrate shared media state with real on-demand media elements.
- Add a live stream health worker and durable verification history.
- Unify listener, studio and admin navigation and role context.

### P1 — quality

- Add Playwright journeys for listener, creator, broadcaster and admin flows.
- Add responsive snapshots and keyboard/focus testing.
- Add failure-state tests for stream, library storage and recorder errors.
- Reconcile README, UI copy and operational evidence after each integration.

### P2 — commercial readiness

- Complete privacy notice, rights schedules, takedown/SLA, analytics retention,
  advertising controls and Uganda regulatory review.
- Implement backup/restore, incident response and secret scanning.
- Expand market data only after real broadcaster onboarding and verification.
