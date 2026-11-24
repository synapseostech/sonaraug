# Sonara — Backend Migration: Local Store → Supabase

**Updated:** 2026-11-23 · **Status:** the adapter, schema and fail-closed configuration are implemented and tested.
No hosted Sonara project exists yet (D-2), so nothing in this document has been run against a remote database.

This replaces the Wave 1 note that "the backend is development-only". It is still **development-first**: the JSON
store remains the default in development and is not removed until the Supabase path passes the acceptance run in
`SONARA_WAVE_2_ACCEPTANCE.md`.

---

## 1. The storage boundary

```
UI (pages, server actions, route handlers)
        │  never touches fs or pg
        ▼
lib/server/<domain>.ts          chronicles · billing · users · auth · media · notify · audit
        │  reads/writes through one interface
        ▼
lib/server/data.ts              readData(scope) / writeData(scope, mutate)
        │
        ├── SONARA_BACKEND=dev       → lib/server/store.ts   (one JSON file, atomic writes, in-process lock)
        └── SONARA_BACKEND=supabase  → lib/server/sb/store.ts (Postgres, RLS as the caller, diff persistence)
```

- `readData(scope)` loads exactly the rows a service declared it needs. `writeData` re-reads under a transaction,
  applies the mutation to the in-memory snapshot and persists the diff, so the services are backend-agnostic.
- In Supabase mode the transaction first sets `role authenticated` (or `anon`) and the verified JWT claims, then
  runs the statements. Row Level Security decides what is visible, exactly as it would through the Data API.
- `withService(reason)` switches to `service_role` (bypasses RLS) for the payment processor, notifications,
  email delivery logs, audit of self-service actions, media registration and display-only lookups. Every call site
  states why; a new call site without a reason is a review failure.
- Raw `pg` queries exist only in `lib/server/sb/*`. Raw `fs` access exists only in `store.ts` and `media.ts`.

### Fail-closed rules (tested)

| Rule | Where | Test |
|---|---|---|
| Production without Supabase config refuses to serve | `resolveBackendConfig` | `backend-config.test.ts` |
| `SONARA_BACKEND=dev` in production refuses unless `SONARA_ALLOW_DEV_BACKEND=1` | `resolveBackendConfig`, `assertDevBackendAllowed` | `backend-config.test.ts` |
| The local store itself also refuses in production | `store.ts › load()` | config test + manual |
| A publishable key cannot be used as the server secret | `resolveBackendConfig` | `backend-config.test.ts` |
| A localhost database is refused in production | `resolveBackendConfig` | `backend-config.test.ts` |
| An unknown backend name is refused, not guessed | `resolveBackendConfig` | `backend-config.test.ts` |

`SONARA_ALLOW_DEV_BACKEND=1` exists only to serve a production **build** on localhost for the browser acceptance
run. It is never set in a deployment; N-1/N-2 in `SONARA_SECURITY_STATUS.md` say what happens if it ever is.

---

## 2. Entity mapping

Legend — **Owner** means what the row belongs to and therefore what the RLS policy keys on.
*Local* is the field in `lib/server/types.ts` / `@kito/billing`.

### Identity and tenancy

| Entity | Local representation | Target table | PK | FKs | Owner / RLS | Indexes | Server operations | Migration | Tests |
|---|---|---|---|---|---|---|---|---|---|
| Profile | `users[]` (`UserRecord`) | `profiles` | `id` (= `auth.users.id`) | `auth.users` | self; staff read via `staff_can` | `profiles_status_idx` | read/update own (column grants), account status, deletion request RPC | 0010, 0110, 0160 | `05_listener_privacy`, `11_wave2_backend` |
| Roles | `users[].roles` | `platform_roles` | `(profile_id, role)` | `profiles` | read-only to the user; writes only via `grant_platform_role` / `revoke_platform_role` | PK | audited RPC; self-change refused; last super admin protected | 0115, 0140, 0160 | `10_creators_roles`, `04_moderation_and_admin` |
| Staff permissions | mirrored in TS (`packages/auth/src/staff.ts`) | `app_private.role_permissions` | `(role, permission)` | — | no client access | PK | `staff_can(permission)` used by admin pages/RPCs | 0160 | unit `staff.test.ts` + `11_wave2_backend` |
| Sessions | `sessions[]` (sha256 of token) | `auth.sessions` (Supabase Auth) | `id` | `auth.users` | Supabase-managed | — | `my_sessions()` lists, `revoke_my_session()` revokes one | Supabase Auth, 0180 | `11_wave2_backend` |
| Verification / reset tokens | `tokens[]` | Supabase Auth (one-time tokens) | — | — | never exposed | — | Supabase sends the link; Sonara never stores it | Supabase Auth | auth journeys (browser) |
| Terms acceptance | `users[].termsVersion` | `profiles.terms_version`, `privacy_version`, `terms_accepted_at` | — | — | self | — | `accept_current_terms()` RPC | 0160 | `11_wave2_backend` |
| Organisation | not in the dev store | `organisations` | `id` | — | members read; staff verify | `organisations_slug_key` | founder becomes owner by trigger; verification is staff-only | 0010, 0110 | `02_tenant_isolation`, `07_security_regressions` F-1 |
| Membership | not in the dev store | `organisation_members` | `(org_id, profile_id)` | org, profiles | org-scoped | PK + role index | invite → token accept RPC; no self-promotion | 0010, 0110 | F-4/F-5 blocks |

The dev store has no organisations because the listener product does not need them yet. The tables exist for
broadcaster organisations and the Wave 4 creator studios; the adapter does not read them.

### Medical Chronicles

| Entity | Local | Target | PK | FKs | Owner / RLS | Notes |
|---|---|---|---|---|---|---|
| Category | `mcCategories[]` | `mc_categories` | `id` | — | public read; `chronicles:categories` to write | 14 seeded by 0130, editable/reorderable/deactivatable |
| Series | `mcSeries[]` | `mc_series` | `id` | category, specialty, cover asset, profiles | public if published; editors write | `free_episode_allowance` null = inherit the platform default |
| Episode | `mcEpisodes[]` | `mc_episodes` | `id` | series, cover, profiles | public if published **and** series public; access checked per viewer | unique `(series, season, episode_number)`; publish requires approval of the current version |
| Episode source | `mcEpisodes[].source` (1:1) | `mc_episode_sources` | `episode_id` | episode, media asset | **no public policy** — playback goes through `mc_episode_playback()` | shape constraint: uploaded ⇒ assetId, otherwise https URL |
| Episode version | `mcVersions[]` | `mc_episode_versions` | `(episode_id, version)` identity | episode, profiles | editors read | full JSON snapshot, append-only |
| Editorial event | `mcEditorialEvents[]` | `mc_editorial_events` | identity | episode, actor | editors read | append-only workflow log |
| Correction | `mcCorrections[]` | `mc_corrections` | `id` | episode, profiles | public read (transparency) | summary ≥ 5 chars |
| Listening history | `listening[]` | `mc_listening_events` | `id` | profile, episode | self only | `control` records whether Sonara or the provider owns playback |
| Saved episodes | `saved[]` | `mc_saved_episodes` | `(profile_id, episode_id)` | profile, episode | self only | |
| Playback progress | in the browser (localStorage) + `listening` | `playback_progress` | `(profile_id, target)` | profile | self only | used for "continue listening" |
| Media asset | `media[]` (path on disk) | `media_assets` | `id` | owner org/profile | uploader + org; served through `/api/media/[id]` after an entitlement check | **local_dev refused in production**; production storage is `r2` (Wave 3) |

### Billing and payments

| Entity | Local | Target | PK | FKs | Owner / RLS | Notes |
|---|---|---|---|---|---|---|
| Plan | `plans[]` (`Plan`) | `subscription_plans` | `id` | created_by | public read of active plans; `plans:manage` to write | `price_is_placeholder` carried from the store until the owner approves prices |
| Promo | `promos[]` | `promo_codes` | `id` | plan_ids[] | staff write; validation server-side | one discount kind; window and redemption limits in SQL |
| Subscription | `subscriptions[]` | `subscriptions` | `id` | profile, plan | self read; staff read/override | `renewal_mode`, `provider_subscription_id`, `applied_transaction_ids` |
| Transaction | `transactions[]` | `payment_transactions` | `id` | profile, plan, subscription | self read; staff read/reconcile; **no client write** | status is `initiated → pending → successful/failed/mismatch`; a DB trigger refuses client-side success |
| Applied payment | derived | `subscription_payments` | `(subscription_id, transaction_id)` | both | staff read | one credit per transaction (primary key = idempotency) |
| Webhook event | `webhookEvents[]` | `payment_webhook_events` | `id` | — | finance read | stores idempotency key, status, attempts; never a raw payload with card data |
| Refund request | `refunds[]` | `refund_requests` | `id` | transaction, profiles | requester reads own; finance decides; **not on own request** (0180 policy) | decision is audited |
| Entitlement override | `overrides[]` | `entitlement_overrides` | `id` | profile, plan, created_by | self read; `subscriptions:override` writes | reason mandatory; `created_by <> profile_id` |
| Entitlements | computed, no table | computed by `@kito/billing` from plans + subscriptions + overrides | — | — | never stored as a mutable flag | the server recomputes on every request |

Entitlements are deliberately **not** a table. A stored boolean is a thing an attacker can flip and a bug can
desynchronise; the effective state is a pure function of subscription, plan, override and clock, evaluated on the
server (`packages/billing/src/entitlements.ts`).

### Notifications, email, audit

| Entity | Local | Target | PK | FKs | Owner / RLS | Notes |
|---|---|---|---|---|---|---|
| Notification | `notifications[]` | `notifications` | `id` | profile | self read; mark read | created by services, not by clients |
| Notification preferences | `users[].emailPreferences` | `notification_preferences` | `(profile_id, kind)` | profile | self | security/transactional kinds ignore preferences |
| Email delivery | `outbox[]` (dev only) | `email_deliveries` | `id` | profile (nullable) | staff read | **no body for verification/reset** (DB check + code); retry via `next_attempt_at` |
| Audit event | `audit[]` (hash-chained JSON) | `audit_logs` | `id` | actor profile | staff read; **no update/delete grants** | hash chain in SQL (`audit_digest`, `audit_chain`), `record_audit_event` RPC, `verify_audit_chain()` |
| Moderation | none in the dev store | `moderation_actions`, `content_reports` | `id` | profiles, target | staff write; reporter reads own | Wave 5 UI; the Wave 3 admin screens that exist are local-only |
| Creator application | `creatorApplications[]` | `creator_applications` | `id` | profile, reviewer | applicant reads own; `creators:review` decides | payment never sets `approved`; a paid plan is a separate check |
| Advertiser / campaign | none | `advertisers`, `campaigns`, `placements`, `campaign_placements`, `advertisements`, `impressions`, `clicks` | `id` | org, staff | staff write; reporting read-only | foundations only; no ad insertion into third-party streams |
| Radio | static registry in `lib/data/streams.ts` | `stations`, `station_streams`, `stream_health_checks`, `rights_records`, `stream_incidents` | `id` | org, profiles | public read of published; broadcaster writes own; health/permission staff-only | two independent axes: technical health vs legal authorisation (F-2) |
| Podcast / video / engagement | Studio local storage + `podcasts`, `videos`, `media_assets` | `podcasts`, `podcast_episodes`, `videos`, `video_assets`, `playlists`, `favourites`, `comments`, `reactions`, `playback_events` | `id` | creators, channels | creator owns; moderation post-review (F-14 open) | Wave 4 migrates the Studio off browser storage |

### Why some things are **not** mapped 1:1

- The dev store has no organisation, channel, station or podcast tables: those experiences are still local/mock
  (Studio and Broadcaster) and are Wave 4/Wave 5. The database schema for them already exists from Waves 0–1.
- Developer documents (`sessions`, `tokens`, `outbox`, password hashes) have **no** production equivalent and are
  intentionally not migrated.

---

## 3. RLS summary (adversarial properties, with tests)

| The user must not be able to… | Mechanism | Regression test |
|---|---|---|
| grant themselves a role | `platform_roles` has no client INSERT/UPDATE; `grant_platform_role` requires `roles:grant`; self-change refused; last super admin protected | `04_moderation_and_admin`, `10_creators_roles`, `11_wave2_backend` |
| approve their own content | `approved_by <> submitted_by` and `<> last_edited_by`; editorial transition checks role | `09_medical_chronicles`, `10_creators_roles` |
| change their own entitlements | overrides require `subscriptions:override`; `created_by <> profile_id` | `08_billing`, `11_wave2_backend` |
| mark their own payment successful | no client UPDATE on `payment_transactions`; trigger refuses status changes from client roles | `08_billing` |
| read another user's private records | per-table owner policies; staff reads gated by `staff_can`; profiles expose a curated column set | `05_listener_privacy`, `06_advertising` |
| reach premium media by bypassing the UI | `mc_episode_sources` has no public policy; `/api/media/[id]` re-checks entitlement; `mc_episode_playback()` returns a location only to an entitled caller | `09_medical_chronicles`, browser L-5 |
| modify audit records | no UPDATE/DELETE grants; hash chain detects edits; append-only RPC | `11_wave2_backend` |
| read another organisation's rows | org-scoped policies on every org table | `02_tenant_isolation` |
| verify their own organisation / stream / rights | staff-only verification functions; guard triggers clear verification when a tenant edits the evidence | `07_security_regressions` F-1/F-2/F-3 |
| truncate a table | 0170 revokes TRUNCATE (RLS does not apply to it) | `11_wave2_backend` |

SECURITY DEFINER functions are reviewed in 0110/0160: every one sets `search_path = ''` and schema-qualifies its
references, is owned by the migration role, and has explicit `revoke … from public, anon` followed by the narrow
grant it needs. `11_wave2_backend` asserts the `anon` grants on the internal helpers are absent.

---

## 4. Data preservation and the migration tool

`scripts/sonara-migrate.mjs` is a planner, not an importer. It never connects to a database.

| Concern | Handling |
|---|---|
| Identifiers | Every local id maps to `sha256("sonara-migration:v1:<kind>:<id>")` formatted as a v8 UUID. Re-running produces identical ids, so references (series → episode, episode → source/version/correction) survive |
| Series/episode ordering | Sorted by `(series, season, episode_number)` and inserted in that order; the numbers themselves are preserved because the free allowance counts publication order |
| Subscription history | Exported to JSON. Subscriptions built on simulator payments are quarantined; the rest are flagged for review |
| Payment references | `tx_ref` and provider ids preserved in the JSON export; **never** emitted as SQL |
| Editorial versions and reviews | `mc_episode_versions` snapshots, editorial events and corrections emitted as SQL with mapped ids; unknown actors become NULL and are listed |
| Rights records | Radio rights live in the database and are not in the dev store; the static registry is not migrated as if it were a licence |
| Duplicates | Duplicate ids, slugs, `(series, season, number)`, version numbers and `tx_ref` are blocking errors |
| Unsupported records | Unknown collections are preserved in the JSON/report, never dropped; sessions/tokens/outbox/password hashes are listed as deliberately not migrated with the reason |
| Dry run | `--dry-run` prints the full report and writes nothing; exit code 1 on any blocking error |
| Reports | `report.md` (human) and `report.json` (machine) with counts, issues, quarantine totals and manual steps |
| Simulated money | Every transaction with `environment != live` goes to `json/simulated-financial.json` with a warning; no SQL path exists for it |

Tests: `scripts/sonara-migrate.test.mjs` (13 assertions) covers deterministic ids, version refusal, duplicate
detection, self-approval, ordering, allowance preservation, source URLs, SQL escaping, quarantine and secrets.

---

## 5. Admin and creator compatibility

| Admin page | Data source today | After Supabase | Still needs work |
|---|---|---|---|
| `/admin` overview | database | **operational** | real analytics later; some tiles are counts |
| `/admin/users`, `/admin/users/[id]` | database | **operational** | fine-grained permissions per staff role |
| `/admin/audit-logs` | database | **operational** | export; retention |
| `/admin/settings` | database | **operational** | versioned policy text |
| `/admin/medical-chronicles/*` | database | **operational** | media upload to object storage (Wave 3) |
| `/admin/subscriptions` (plans) | database | **operational** | plan change history view |
| `/admin/payments` | database | **operational** | live provider reconciliation (Wave 3) |
| `/admin/content` (podcast + video review) | **localStorage (StudioProvider)** | still local | Wave 4: move Studio entities to the database, then review becomes real |
| `/admin/stations`, `/admin/stations/[id]` | **localStorage** | still local | Wave 5: station/stream tables exist, UI is mock |
| `/admin/reports`, `/admin/history`, `/admin/rights` | **localStorage** | still local | Wave 5: `content_reports`, `moderation_actions`, `rights_records` exist |
| `/admin/creators` | **localStorage** | still local | Wave 4: `creator_applications` RPCs exist, UI is a readiness view |
| `/studio/*` (creator + broadcaster) | **localStorage** | still local | Wave 4 |
| `/creator/*` (20 routes from the brief) | not built | — | Wave 4 |

Every local-only screen says so on the page. Nothing in this wave moved Studio data into the database, because
doing that without the creator ownership model would have created a second, weaker permission system.
