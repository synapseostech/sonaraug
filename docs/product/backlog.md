# Backlog

Priority: **P0** launch blocker · **P1** launch quality · **P2** post-launch.
Effort in engineer-days (rough), assuming the foundation in this repo.

## Done (Phase 1–2 foundation)

| # | Item | Notes |
|---|---|---|
| F1 | Monorepo, strict TS, task graph, CI-ready scripts | ADR-0001 |
| F2 | Brand/config/tokens/feature flags | 28 tests |
| F3 | Playback model: capabilities, failover, backoff, resume | 27 tests, 1 real bug fixed |
| F4 | Validation incl. SSRF guard, UG phone normalisation | 17 tests |
| F5 | Permission matrix | 10 tests |
| F6 | Analytics catalogue with consent + PII guards | 8 tests |
| F7 | 44-table schema with constraints, partitions, triggers | applied |
| F8 | RLS across all roles + audited RPCs | 6 suites passing |
| F9 | Local DB test harness (no Docker/sudo) | ADR-0008 |
| F10 | ADRs, architecture, security docs | this repo |

## Phase 3 — Listener MVP

| # | Story | Pri | Depends |
|---|---|---|---|
| L1 | Provision Supabase project; generate types; deploy migrations | P0 | owner credentials |
| L2 | Auth: anonymous session, email OTP, phone OTP, Apple/Google, account deletion | P0 | L1 |
| L3 | Radio directory API (search/filter by region, language, category) | P0 | L1 |
| L4 | Station detail page with schedule and presenters | P0 | L3 |
| L5 | Play resolution endpoint returning ordered verified endpoints | P0 | L3, stream-monitor |
| L6 | Mobile player: background audio, lock screen, audio focus, interruptions | P0 | L5 |
| L7 | Web player + Media Session, hls.js for video | P0 | L5 |
| L8 | Podcast directory, series page, episode page | P0 | L1 |
| L9 | Playback speed, queue, resume, history | P0 | L8, L6 |
| L10 | Video feed, player, quality selector, captions | P0 | L1 |
| L11 | Search across all content types | P0 | L3, L8, L10 |
| L12 | Library: favourites, follows, playlists, history, settings | P0 | L2 |
| L13 | Home composition incl. sponsored slot (labelled) | P0 | L3, L8, L10 |
| L14 | Push notifications: new episode for followed podcast | P1 | L9 |
| L15 | Data-saver mode surfaced in settings | P1 | L6 |
| L16 | Offline episode downloads where permitted | P2 | L9 |

## Phase 4 — Broadcaster and creator ecosystem

| # | Story | Pri |
|---|---|---|
| B1 | Organisation onboarding + first owner bootstrap | P0 |
| B2 | Verification document upload and admin review | P0 |
| B3 | Station CRUD + artwork + categories/languages | P0 |
| B4 | Stream endpoint registration with URL safety checks | P0 |
| B5 | Schedule and presenter management | P1 |
| B6 | Stream health dashboard for the broadcaster | P1 |
| B7 | Member invitations and role management | P1 |
| C1 | Creator channel creation | P0 |
| C2 | Podcast create + RSS import (idempotent) | P0 |
| C3 | Episode upload with validation and duration probing | P0 |
| C4 | Video upload → Stream → `video_assets` state machine | P0 |
| C5 | Caption upload and default track selection | P1 |
| C6 | Comment moderation tools in studio | P1 |
| A1 | Admin: verification queue | P0 |
| A2 | Admin: content queue and report triage | P0 |
| A3 | Admin: station/stream health board | P1 |
| A4 | Admin: rights records management | P0 |
| A5 | Admin: user and role management | P1 |
| A6 | Admin: audit log viewer | P1 |

## Phase 5 — Monetisation

| # | Story | Pri |
|---|---|---|
| M1 | Placement slots rendered with "Sponsored" label | P0 |
| M2 | Campaign + creative management (admin-operated) | P0 |
| M3 | Signed impression/click endpoints with dedupe and frequency caps | P1 |
| M4 | Advertiser read-only reporting dashboard | P1 |
| M5 | Campaign pacing and budget enforcement | P2 |
| M6 | Payout accrual and finance approval flow | P2 |

## Phase 6 — Launch

| # | Item | Pri |
|---|---|---|
| X1 | Security review + RLS audit + secret scan | P0 |
| X2 | Device matrix (Android 8/10/13, iPhone SE/12, 3G throttling) | P0 |
| X3 | 24-hour radio soak test across all listed stations | P0 |
| X4 | Load test: directory, search, play resolution | P1 |
| X5 | Store assets, privacy declarations, submission | P0 |
| X6 | Legal clearance per `copyright-and-rights.md` | P0 |
| X7 | Beta with 3 broadcasters and 3 creators | P1 |
| X8 | Runbooks: incident, stream outage, takedown, restore | P0 |
