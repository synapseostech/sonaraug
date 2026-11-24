# Sonara — Security Status

**Date:** 2026-11-22, reassessed 2026-11-23  ·  **Scope:** repository at `/home/ebrine/dev/SYNAPSE Player` (no git commits; all files untracked)
**Method:** source review, plus exploit probes executed as the real `anon` / `authenticated` roles against a throwaway PostgreSQL 16 cluster built from `supabase/migrations/*` by `supabase/tests/run-tests.sh`. No Supabase project, network service or production data was touched.

> **Product name.** As of 2026-11-23 the user-facing brand default is **Sonara** (`packages/config/src/brand.ts`); internal identifiers keep the `kito` codename until a rename plan is approved.

> **About the F-numbers.** The original F-1 to F-15 list from the previous session was not saved anywhere on disk. The only surviving reference is ADR-0009, which identifies **F-10** as the missing `@kito/ui` package that broke `pnpm install`. The other fourteen findings below were **reconstructed in this audit** from the areas named in the brief: tenant isolation, broadcaster verification, stream playability, rights verification, SSRF, invitation acceptance, consent privacy and media metadata. Every one of them was re-verified from first principles. Eleven database findings were proven with executed exploits, and F-9 with an executed bypass test. If the original list surfaces, map it onto this one; do not assume the numbers match one-to-one.

---

## 2026-11-23 reassessment (product expansion, Waves 0–1)

The 2026-11-22 findings below remain the record of the original audit. This section reassesses them after the server-side layer, Medical Chronicles, accounts, subscriptions, payments and the admin platform were added. Evidence: `pnpm test` (240 unit tests), `pnpm test:db` (11 suites, incl. `08_billing`, `09_medical_chronicles`, `10_creators_roles`, `11_wave2_backend`), `scripts/sonara-e2e.mjs` (27 browser journeys against a production build), a CSP/header check against both the dev server and the production build, and adversarial HTTP probes (see SONARA_WAVE_2_ACCEPTANCE.md and SONARA_ACCEPTANCE_TESTS.md §5).

### Status of F-1 … F-15

| # | Status 2026-11-23 | Change in this wave |
|---|---|---|
| F-1 Org self-verification | Fixed (DB) — unchanged | — |
| F-2 Stream playability | Fixed (DB) — unchanged; app still uses the static registry | — |
| F-3 Self-attested rights | Fixed (DB) — unchanged | — |
| F-4 Invitation acceptance | Fixed (DB), residual (no issuance RPC/UI) — unchanged | — |
| F-5 Org takeover | Fixed (DB), residual — unchanged | — |
| F-6 Consent privacy | Fixed (DB); **app**: account data is now server-rendered for the owner only; export returns only the caller's data (tested L-9) | Improved |
| F-7 Media metadata exposure | Fixed (DB); **app**: uploaded audio is served only through `/api/media/[id]` after an entitlement check, `private, no-store`, magic-byte validated; premium sources are not publicly selectable (`mc_episode_sources` has no public policy) | Improved |
| F-8 Partitions bypass RLS | Fixed (DB), residual catalog check still to add | — |
| F-9 SSRF guard | Partially fixed — **no server-side fetch of user-supplied URLs was added**: NotebookLM links are never fetched; authorised URLs are host-allow-listed (no IP literals/localhost/non-443) and fetched by the listener's browser, not the server. The only server fetches go to the configured Flutterwave base URL | Unchanged risk; not widened |
| F-10 Workspace install | Resolved — new packages link offline | — |
| F-11 Licence expiry | Fixed (DB) — unchanged | — |
| F-12 Client-side gates | **Partially fixed.** Medical Chronicles access, accounts, subscriptions, payments and the new admin sections are enforced on the server (pages, actions, route handlers re-check). Still client-side: radio station gating, Creator Studio, broadcaster tools, the "Review (demo data)" admin screens; unlicensed stream URLs still ship in the bundle (roadmap 0.3) | Improved |
| F-13 Media pipeline bypass | Fixed (DB); app uploads now validate content by magic bytes and size and record SHA-256; staff-only | Improved |
| F-14 Creator trust / review | Partially fixed; creator publishing now requires approval **and** a paid plan in the entitlement engine and DB (`creator_applications` guard); MC has enforced no-self-approval | Improved |
| F-15 Platform hardening | **Still open:** no CSP/HSTS. Login throttling and lockout added (in-memory, per process). `app_private` functions remain callable by `anon` (all are read-only predicates) | Partially improved |

### Wave 2 controls (Supabase migration and hardening, 2026-11-23)

- **Backend selection is fail-closed** (`lib/server/backend-config.ts`, 10 unit tests): production without Supabase
  configuration throws; `SONARA_BACKEND=dev` is refused in production unless the smoke-test flag is set; a
  publishable key cannot be used as the server secret; plain http is only accepted for localhost.
- **RLS is the enforcement layer, not the UI**: every Supabase request runs as `authenticated`/`anon` with the
  verified JWT claims; the service role is used only where a call site states a system reason.
- **Role escalation**: roles remain rows in `platform_roles`, written only by the audited RPC; user metadata is
  display-name only (`0160 handle_new_user`). Re-asserted in `11_wave2_backend`.
- **Privilege baseline (N-9)**: 0170 removes Supabase's default table grants, including TRUNCATE.
- **Audit integrity**: SQL hash chain (`audit_digest`, `audit_chain`), append-only grants, `verify_audit_chain()`;
  `11_wave2_backend` tampers with a row and proves verification fails.
- **Secrets**: `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`, `SMTP_PASS` added to `SERVER_ONLY_KEYS`; the production
  bundle scan finds no server-only names.
- **Headers**: nonce CSP, HSTS-on-HTTPS, COOP — see F-15/N-7.

### New controls added in this wave

- **Payments:** webhook `verif-hash` constant-time check; every charge re-verified via `GET /v3/transactions/{id}/verify`; amount/currency/reference matching; idempotency keys + one-credit-per-transaction (TS and DB primary key); final states immutable (trigger); **no client path — not even an admin's — can mark a payment successful** (DB grant + trigger, tested); redirect `status` ignored; secrets server-only (bundle scanned).
- **Entitlements:** server-side engine; listener/creator separation; audited overrides with mandatory reasons; nobody adjusts their own entitlements (TS + DB check constraint).
- **Privilege separation:** self role changes refused; admin roles only by super admin; last super admin protected; roles re-read per request.
- **Editorial integrity:** no self-approval (TS + trigger), current-version approval, corrections and versions, withdrawal.
- **Audit:** hash-chained log with integrity check; DB audit triggers on all new commercial and editorial tables.
- **Sessions:** hashed tokens, HttpOnly/SameSite cookies, lockout, reset revokes sessions, open-redirect guard, same-origin checks on cookie-authenticated route handlers.

### New risks and residual items (numbered N-1 …)

| # | Item | Severity | Mitigation / plan |
|---|---|---|---|
| N-1 | The development JSON store and local-disk media are not production persistence (single process, no backup, no encryption at rest) | High if deployed | **Supabase adapter implemented in Wave 2** (`lib/server/sb/*`, RLS as the caller, service role limited to named system operations). The dev store still refuses to start in production without `SONARA_ALLOW_DEV_BACKEND=1` — unit-tested — and production defaults to `supabase`, where missing configuration throws `BackendConfigError` instead of falling back. **Never set the flag on a real deployment.** Media remains `local_dev` (refused in production) until R2 lands in Wave 3 |
| N-2 | `SONARA_ALLOW_DEV_BACKEND=1` also enables the payment simulator and the dev outbox | High if misused | Same as N-1; the build itself now fails without backend configuration, which makes an accidental dev-backend production build harder. A deploy-time check that the flag is absent is still required (Wave 6) |
| N-3 | A public NotebookLM share link, once revealed to an entitled listener, can be shared onward | Medium (revenue) | Documented; use uploaded audio for premium content |
| N-4 | Authorised-URL sources are revealed to entitled listeners and are not proxied | Low–Medium | Allow-list only; prefer uploads; optional proxy later |
| N-5 | Flutterwave subscription-cancel endpoint path is unverified | Medium | **Path now verified against the official API reference** as `PUT /v3/subscriptions/{id}/cancel` (cancels one subscription, not the plan); the adapter implements it and the local simulator exercises it. Still **not executed against Flutterwave's sandbox** (no keys). Failure is surfaced to the listener and audited |
| N-6 | Rate limiting is in-memory per process; no CAPTCHA on registration | Medium | **Distributed limiter implemented** (`app_private.rate_limit_hit`, hashed keys) and used whenever the Supabase backend is active; the dev backend keeps the in-memory limiter. CAPTCHA/Turnstile on registration is still open (F-15) |
| N-7 | No CSP/HSTS yet (F-15) | **Resolved in the application (2026-11-23)** | `middleware.ts` sets a nonce-based CSP (`strict-dynamic`, media allow-list from the verified stream registry) on every document, and HSTS only for HTTPS requests. 9 unit tests + a browser check (10 routes, 0 violations in dev; production journey SEC-HDR). The enforcing edge/tunnel TLS configuration remains a deploy task |
| N-8 | Webhook processing is synchronous inside the request (verification call within Flutterwave's 60 s timeout) | Low | Move to a queue when volume grows |
| N-9 | Supabase's default ACLs granted `anon`/`authenticated` every privilege (including TRUNCATE, which RLS does not cover) on tables created by migrations written for stock PostgreSQL | High (privilege layer absent) | **Resolved**: `0170_privilege_baseline.sql` revokes all client privileges and grants back only what each policy needs; asserted by `11_wave2_backend`. Found by running the suites against a real local Supabase stack — exactly the class of bug a mock cannot find |

### Matters needing qualified legal or regulatory review (not claimed as compliant)

Uganda Data Protection and Privacy Act 2019 (registration with the PDPO, lawful bases, retention, cross-border transfer to Flutterwave and hosting providers, data-subject rights process); consumer protection and electronic transactions (subscription terms, auto-renewal disclosures, refunds); tax (VAT on digital services, receipts); payment regulation (Bank of Uganda / National Payment Systems Act — Flutterwave as the licensed processor, Sonara's merchant obligations); copyright and licensing for NotebookLM-generated audio derived from third-party sources and for radio retransmission; health-information content (educational disclaimers, any professional-body guidance on medical education media).

---

## Summary (2026-11-22 audit)

| # | Finding | Severity (as found) | Vulnerable before this audit? | Status now | Fixed in |
|---|---|---|---|---|---|
| F-1 | Tenants can verify their own organisation | Critical | **Yes**, exploited | **Fixed (DB)** | `0110` |
| F-2 | Tenants can declare their own stream playable, or swap the URL of a verified stream | Critical | **Yes**, exploited | **Fixed (DB)** | `0110` |
| F-3 | Rights evidence is self-attested; the publish gate accepts unverified rights | Critical | **Yes**, exploited | **Fixed (DB)** | `0110` |
| F-4 | Invitation acceptance allows role escalation and org hopping; token acceptance did not exist | High | **Yes**, exploited | **Fixed (DB)**, residual items | `0110` |
| F-5 | Any signed-in user can take over any organisation | **Critical** | **Yes**, exploited end to end | **Fixed (DB)**, residual items | `0110` |
| F-6 | Listener consent flags and account fields are publicly readable | High | **Yes**, exploited | **Fixed (DB)**, residual items | `0110` |
| F-7 | Media object keys and metadata (including KYC images) are publicly readable | High | **Yes**, exploited | **Fixed (DB)**, residual items | `0110` |
| F-8 | Table partitions bypass RLS: anyone can read, and tenants can delete or forge, analytics and monitor evidence | High | **Yes**, exploited | **Fixed (DB)**, residual items | `0110` |
| F-9 | The SSRF guard misses IPv4-mapped IPv6, NAT64, tunnels and reserved IPv4, and never resolves DNS | High (latent: no fetcher exists yet) | **Yes**, demonstrated | **Partially fixed** | `packages/validation` |
| F-10 | Workspace install broken by a missing `@kito/ui` (original finding, ADR-0009) | Build blocker | Resolved before this audit | **Resolved**, residual items | ADR-0009 |
| F-11 | A published station stays public after its licence expires or is withdrawn | High (legal) | **Yes**, exploited | **Fixed (DB)** | `0110` |
| F-12 | All web gates (rights, roles, review) are client-side only; unlicensed stream URLs ship in the JS bundle | High (legal/product) | Yes | **Open, by design for the demo** | — |
| F-13 | Clients can register media as already processed, un-quarantine it, or claim another tenant's object key | High | **Yes**, exploited | **Fixed (DB)** | `0110` |
| F-14 | Creators can self-verify, self-monetise, award their own badge, inflate counters, and publish without review | High | **Yes**, exploited | **Partially fixed**: trust fields fixed, review is a product decision | `0110` |
| F-15 | No CSP or HSTS, no rate limiting on anonymous writes, `app_private` callable by `anon` | Medium | Yes | **Open** | — |

**Bottom line.** Before this audit, the database security model was not fit for any multi-tenant use:
- An unverified broadcaster could publish an unprobed, unlicensed station without any staff involvement (F-1 + F-2 + F-3, chain P4a–P4e).
- Any signed-in user could become owner of any organisation (F-5, chain P6b–P6h).

Migration `0110_security_hardening.sql` closes every database-level exploit that was reproduced. 64 new assertions in `supabase/tests/rls/07_security_regressions.sql` pin the fixes, and I confirmed that suite fails against the pre-fix schema.

Three groups remain open, and none can be fixed in the front end:
- **Application-level work:** auth, signed URLs, the stream monitor and rate limiting.
- **Legal and commercial work:** broadcaster agreements.
- **Product decisions:** creator pre-moderation and the visibility of organisation contacts.

---

## Exploit evidence

The probe scripts were run as `set local role anon|authenticated` with `request.jwt.claim.sub` set, which is exactly how PostgREST runs a client request. The table shows results **before** `0110`, then **after**.

| Probe | Actor | Action | Before | After |
|---|---|---|---|---|
| P1 | Owner of unverified org B | `update organisations set verification_status='verified'` | ALLOWED | DENIED |
| P1b | Any listener | `insert organisations (... verification_status='verified')` | ALLOWED | DENIED |
| P2 | Editor of org A | `update station_streams set status='playable'` on an unprobed stream | ALLOWED | DENIED |
| P3 | Owner B | Insert `broadcaster_authorised` rights record | ALLOWED | ALLOWED, but now **unverified evidence only**, which can't unlock publishing |
| P4a–e | Owner B | Self-verify, insert playable stream, self-rights, publish; `anon` then sees the station and the attacker URL | **All ALLOWED; anon served attacker stream** | Chain refused at step 1; anon sees 0 rows |
| P5′ | Pending editor invitee | `update organisation_members set role='admin', accepted_at=now()` (no `WHERE`) | ALLOWED, became admin | DENIED |
| P5b′ | Pending invitee | Same, plus `org_id = <org A>` | ALLOWED, read org A drafts and RSS config | DENIED |
| P6 | Stranger | Claim owner of an organisation with no owner | ALLOWED | DENIED |
| P6b–h | Stranger | Create own org → insert *pending* owner row → move row into victim org as admin → demote real owner → promote self → delete real owner | **All ALLOWED: full takeover** | Pending owner row refused; move refused; admins can't touch the owner |
| P7 | `anon` | `select analytics_consent, ads_consent, marketing_consent, is_anonymous from profiles` | 1 row returned | `permission denied` |
| P8 | `anon` | Read `storage_key`, `metadata` of a ready KYC licence scan (`image`) | Returned with fake EXIF GPS | `permission denied`; row hidden |
| P9b/c | `anon` | `select * from playback_events_default` / `stream_health_checks_default` | Rows returned (listener id, session, network) | `permission denied` |
| P9d–f | Editor | `delete from stream_health_checks_default`, `delete from playback_events_default`, forge a health row | ALLOWED | `permission denied` |
| P10 | Editor | Insert audio asset with `status='ready'` | ALLOWED | DENIED |
| P11–13b | Listener/creator | Pre-verified creator, own `is_verified` badge, `view_count_cached=999999` | ALLOWED | DENIED |
| P12 | Creator | Publish a draft video with no review | ALLOWED | **Still ALLOWED** (decision D-4) |
| P14 | `anon` | See a station after its licence expired | Visible | Hidden |
| P18 | Editor | Change URL of the published, verified stream | ALLOWED, anon served hijack URL as `playable` | Update allowed but stream resets to `registered`; anon sees 0 rows |

To re-run: `KEEP_CLUSTER=1 pnpm test:db`, then run the probe scripts kept in the session scratchpad. They are superseded by `07_security_regressions.sql`, which encodes each probe as an assertion.

---

## Findings in detail

### F-1 — Tenants can verify their own organisation

- **Original finding:** `organisations_update_admin` (0100) lets an org owner or admin `UPDATE` any column, and `organisations_insert_self` lets anyone `INSERT` any column values. `verification_status` and `verified_at` are among those columns. Verification gates both the station publish trigger and public visibility (`org_is_verified`), so it is the root of trust for "verified broadcaster".
- **Status:** Fixed at the database layer.
- **Files:** `supabase/migrations/0010_identity_tenancy.sql` (columns), `0100_row_level_security.sql` (policies), `0110_security_hardening.sql` (`organisations_guard_trust`, `app_private.guard_trusted_columns`, `app_private.is_trusted_writer`).
- **Does the original vulnerability still exist?** No. Clients can't set these columns on insert or change them on update. Platform admins, `service_role` and `SECURITY DEFINER` RPCs can.
- **Evidence:** probes P1, P1b, P4a: ALLOWED → DENIED. Regression tests `F-1 …` (4 assertions) include positive controls: an owner can still edit ordinary details, anyone can still register an unverified organisation, and an admin can verify.
- **Remediation still needed:** build the staff verification workflow (review `verification_requests` and its document, then approve) as an audited RPC or edge function. Today the admin UI's "verify" is a `localStorage` toggle (F-12).
- **Required regression test:** `07_security_regressions.sql` › F-1 block. Must stay green.

### F-2 — Tenants can declare their own stream playable

- **Original finding:** `streams_write_org` grants org owners, admins and editors `ALL` on `station_streams` with no column restriction. A tenant could insert an endpoint as `playable` with a `last_verified_at`, or repoint an already-verified, publicly served endpoint at any URL while it stayed `playable` (P18). The "only an endpoint our prober has played may be served" rule in the 0030 header comment was not enforced.
- **Status:** Fixed at the database layer.
- **Files:** `0030_radio.sql`, `0100_row_level_security.sql`, `0110_security_hardening.sql` (`app_private.guard_station_stream`).
- **Does the original vulnerability still exist?** No.
  - A new endpoint must start as `registered` with no verification fields.
  - Tenants can't change `status` except to `revoked`.
  - Tenants can't touch `last_verified_at`, `last_checked_at` or `consecutive_failures`.
  - Changing `url` or `protocol` resets the endpoint to `registered` with `last_verified_at = null`, so it drops out of `stream_is_public` until it is re-probed.
- **Evidence:** P2, P4b → DENIED; P18b anon rows 1 → 0. Regression `F-2 …` (6 assertions, including "an owner can still withdraw their own endpoint" and "an editor can still register a new endpoint").
- **Remediation still needed:** the `workers/stream-monitor` directory is **empty**, so nothing will ever promote a stream to `playable` in production. That worker is a P0 for live radio (see roadmap Wave 2). The probe must apply F-9's resolution-time SSRF checks.
- **Required regression test:** F-2 block. Add a worker-level test when the monitor exists: a probe of an unreachable URL must never produce `playable`.

### F-3 — Rights evidence is self-attested

- **Original finding:** `rights_records_manage_org` lets org owners and admins write rights records, including `verified_by` and `verified_at`. The publish gate (`enforce_station_publishable`) counted any non-`unknown` record in force for UG, with no verification requirement, so a broadcaster's own say-so satisfied the legal gate. The existing test `03_publish_gate.sql` encoded this as intended behaviour ("Owners may record the broadcaster authorisation" → publish succeeds).
- **Status:** Fixed at the database layer.
- **Files:** `0080_trust_and_audit.sql`, `0090_functions_triggers.sql` (gate), `0100` (policy), `0110` (`guard_rights_record`, `station_has_rights_in_force`, redefined `enforce_station_publishable`).
- **Does the original vulnerability still exist?** No.
  - Tenants may still **submit** rights evidence, which is intended, but can't set `verified_by` or `verified_at`.
  - Any substantive edit to a verified record clears its verification.
  - The publish gate and public visibility both require `verified_at is not null`.
- **Evidence:** P4c is still ALLOWED (evidence submission), but P4d/P4e now fail. The updated `03_publish_gate.sql` asserts that an owner can't verify their own rights, that unverified rights block publishing, and that a platform admin can verify. Regression F-3 asserts that a tenant edit clears verification and removes the station from the directory.
- **Remediation still needed:** an admin rights-review workflow backed by documents (the `document_asset_id` upload path). Signed broadcaster agreements are a **legal prerequisite, not an engineering one** (`docs/security/copyright-and-rights.md`).
- **Required regression test:** F-3 block plus `03_publish_gate.sql`.

### F-4 — Invitation acceptance

- **Original finding:**
  - The only acceptance path was the RLS policy `org_members_update_accept`, whose `WITH CHECK` constrained only `profile_id`. Because a pending invitee can't `SELECT` their own row, an `UPDATE … WHERE` silently matched 0 rows, so normal acceptance didn't work. That made the bug look harmless.
  - An `UPDATE` **without** a `WHERE` clause skips the SELECT-visibility requirement, and then the invitee could set `role='admin'` and even rewrite `org_id` into a different organisation (P5′, P5b′).
  - `organisation_invitations` (token hashes) had no acceptance function at all.
- **Status:** Fixed at the database layer, with residual items.
- **Files:** `0010` (tables), `0100` (policies), `0110` (`guard_membership`, `org_members_select_own`, `public.accept_organisation_invitation`).
- **Does the original vulnerability still exist?** No.
  - Membership rows can't be moved, whether by `org_id` or `profile_id`.
  - Only owners or admins can change roles.
  - Only the invitee can set `accepted_at`, and only from `NULL`.
  - Invitees can now see their own pending rows, so a normal acceptance works.
  - `accept_organisation_invitation(token)` hashes the token with SHA-256, requires the JWT email to match, refuses expired or reused tokens, and returns one generic error so it can't be used as a token oracle.
- **Evidence:** P5′/P5b′ → DENIED. Regression F-4 has 10 assertions, covering correct acceptance, wrong email, wrong token, double redemption, and exact role granted.
- **Remediation still needed:**
  1. Require a **confirmed** email (`email_confirmed_at`, or the Supabase `email_verified` claim) before redemption.
  2. Build invitation issuance: an RPC that generates the token server-side, stores only the hash and sends the email. Today a client could choose its own token hash, which is acceptable only because creating an invitation is restricted to owners and admins.
  3. Build an expiry/cleanup job.
- **Required regression test:** F-4 block. Add an "unconfirmed email can't redeem" test when the confirmation check lands.

### F-5 — Organisation takeover

- **Original finding:** `org_members_insert_manage`'s bootstrap clause let **any** user insert themselves as `owner` of **any** organisation with no accepted owner. A pending (unaccepted) owner row could be created in a self-made org and then moved into a victim org through the F-4 hole. Separately, any org admin could demote, delete or replace the owner. P6b–P6h executed the full chain against fixture org A: create org → pending owner row → move into org A as admin → read org A's private RSS config → demote the real owner → promote self to owner → delete the real owner.
- **Status:** Fixed at the database layer, with residual items.
- **Files:** `0100` (policy, `can_bootstrap_owner`), `0110` (re-created `org_members_insert_manage`, `org_created_by_me`, `guard_membership`).
- **Does the original vulnerability still exist?** No.
  - Bootstrap ownership requires that the caller **created** the organisation and that the row is accepted.
  - An `owner` row can't be inserted any other way.
  - Only the owner can grant or remove ownership or delete the owner row.
  - Rows can't be moved.
- **Evidence:** P6, P6c → DENIED; P6d–h now affect 0 rows or are refused. Regression F-5 has 8 assertions, including that an admin can still change an ordinary member's role.
- **Remediation still needed:**
  - **Ownership transfer** is now impossible for a non-staff user. Demoting yourself first loses the right to promote the successor, and the single-owner index blocks the reverse order. Build an audited `transfer_organisation_ownership(new_owner)` RPC.
  - An organisation created by staff or a service (`created_by` null) can only receive an owner through a trusted writer. That is intended.
- **Required regression test:** F-5 block.

### F-6 — Consent privacy

- **Original finding:** RLS selects rows, not columns. `profiles_select_public` exposed **every column** of every listener who had set a handle to `anon`: `analytics_consent`, `ads_consent`, `marketing_consent`, `is_anonymous`, `status`, `locale`, `country_code`. That is personal data under the Uganda Data Protection and Privacy Act 2019, published to the internet.
- **Status:** Fixed at the database layer, with residual items.
- **Files:** `0010` (columns), `0100` (policy and grants), `0110` (column-level `grant select`, `public.get_my_profile()`).
- **Does the original vulnerability still exist?** No. `anon` and `authenticated` can only select `id, handle, display_name, bio, avatar_asset_id, created_at`. A user reads their own full row through `get_my_profile()`. Own-row updates still work.
- **Evidence:** P7 → `permission denied`. Regression F-6 has 6 assertions: public fields readable, consent and account fields denied to `anon` and to other users, own consent readable and writable.
- **Remediation still needed:**
  - Consent changes are plain column updates with no history. DPPA practice expects a consent ledger (who, what, when, which notice version). Add a `consent_events` append-only table written through an RPC.
  - Platform staff now need an RPC or `service_role` to read consent, which is intended.
  - The web app has no consent UI at all, and `@kito/analytics` consent gating isn't wired into the app.
- **Required regression test:** F-6 block. Add a ledger test when the ledger exists.

### F-7 — Media metadata exposure

- **Original finding:**
  - `media_select_public_artwork` exposed **every** `ready` image or caption to `anon`, whatever its purpose. That included broadcaster licence scans and identity documents uploaded as images for `verification_requests` (P8).
  - Table-level `grant select` exposed `storage_key` (which the 0020 comment promises is never returned to clients), `metadata` (free-form JSON, potentially EXIF GPS or uploader details), `provider_asset_id` and `checksum_sha256`.
- **Status:** Fixed at the database layer, with residual items.
- **Files:** `0020_media_assets.sql`, `0100`, `0110` (column `is_public`, re-created policy, column-level grants).
- **Does the original vulnerability still exist?** No. Public visibility now requires an explicit, platform-set `is_public` flag. `storage_key`, `external_url`, `metadata`, `provider_asset_id` and `checksum_sha256` are not selectable by `anon` or `authenticated`.
- **Evidence:** P8/P8b → DENIED. Regression F-7 has 5 assertions: an unflagged licence scan is hidden, flagged artwork is visible, keys and metadata are denied to both roles.
- **Remediation still needed:**
  - The `media-token` signed-URL edge function referenced in 0020 **does not exist**. Owners currently have no way to read their own private media.
  - The media pipeline must set `is_public` when an image is attached as public artwork and must strip EXIF before storing.
- **Required regression test:** F-7 block. Add a pipeline test: an uploaded JPEG with GPS EXIF must be served without it.

### F-8 — Partitions bypass RLS

- **Original finding:** the 0100 loop enabled RLS only on `relispartition = false` relations, but `grant … on all tables` also granted privileges on the partitions. `playback_events_default` and `stream_health_checks_default` were therefore readable by `anon`, exposing listener id, session id and network type for every event. Any authenticated user could also `DELETE` from them or forge rows. That would have let a tenant erase the stream-health evidence F-2 depends on.
- **Status:** Fixed at the database layer, with residual items.
- **Files:** `0030`, `0060` (partitioned tables), `0100` (loop), `0110` (`app_private.secure_partition`, loop over existing partitions).
- **Does the original vulnerability still exist?** No for existing partitions. All client privileges on partitions are revoked and RLS is enabled. Inserts through the parent still work.
- **Evidence:** P9b–P9f → `permission denied`. Regression F-8 has 6 assertions, including "anonymous telemetry still works through the parent".
- **Remediation still needed:** every **future** partition, such as the monthly partitions the planned analytics and stream-monitor workers will create, must call `app_private.secure_partition()` (granted to `service_role` only). Put this in the worker contract, and add a CI check that runs `select relname from pg_class where relispartition and relrowsecurity = false` and expects 0 rows.
- **Required regression test:** F-8 block, plus that CI catalog check.

### F-9 — SSRF guard

- **Original finding:** `isPrivateOrReservedHost` (`packages/validation/src/common.ts`) matched string prefixes. URL parsers canonicalise `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, which the guard didn't recognise. So `http://[::ffff:a9fe:a9fe]/` (the 169.254.169.254 cloud metadata service), `[::7f00:1]`, `[64:ff9b::a9fe:a9fe]` (NAT64), `[fec0::1]`, `198.18.0.0/15`, multicast and broadcast all passed `publicUrlSchema`. The guard also doesn't resolve DNS: `127.0.0.1.nip.io` passes.
- **Status:** Partially fixed.
- **Files:** `packages/validation/src/common.ts`, `packages/validation/src/security.test.ts`.
- **Does the original vulnerability still exist?**
  - **Literal bypasses: no.** The guard now parses IPv4 and IPv6 properly and blocks the RFC 6890 special-purpose ranges. That covers `::/96`, IPv4-mapped (checked by embedded address), NAT64, ULA, link- and site-local, multicast, documentation, Teredo and 6to4. Legacy numeric forms are canonicalised exactly as a URL parser would. A new export, `isReservedIpAddress`, is meant for checking resolved addresses.
  - **DNS rebinding and resolution bypasses: still possible by design.** A syntactic check can't catch a public name that resolves to a private address.
  - **Currently latent:** no server-side fetcher exists. The stream monitor and RSS importer are not implemented, and the web app makes no server fetches.
- **Evidence:** before the fix, an executed probe accepted 11 bypass URLs. After: new tests block 23 literal forms and 4 URLs, and public IPv4/IPv6, including Ugandan and African ranges, stay allowed. 140/140 unit tests pass.
- **Remediation still needed:** every server-side fetcher (stream monitor, RSS import, artwork fetch) must:
  - resolve the name, reject the request if any resolved address is reserved, and pin the connection to the checked address;
  - follow redirects manually, at most 3, re-checking every hop;
  - enforce timeouts and a byte cap, and send no credentials;
  - run from an egress-restricted environment.

  Put this in one shared `safeFetch` and forbid raw `fetch` in workers via lint.
- **Required regression test:** `security.test.ts` (in place), plus a `safeFetch` test using a stub resolver that returns `127.0.0.1` for a public-looking name. It must refuse.

### F-10 — Workspace install broken by missing `@kito/ui` (original finding)

- **Original finding:** per ADR-0009, `apps/web` and `apps/mobile` declared `@kito/ui` but the package did not exist, so `pnpm install` failed at the workspace root.
- **Status:** Resolved (before this audit), with residual items.
- **Files:** `packages/ui/*`, `docs/decisions/ADR-0009-ui-package-scope.md`, `pnpm-lock.yaml`.
- **Does it still exist?** No. `packages/ui` exists, and the lockfile has importers for every app and package. Typecheck and the web build pass.
- **Residual items:**
  - `apps/mobile` and `apps/admin` have **no installed `node_modules`** in this checkout, so neither has been built or run.
  - The machine runs **Node 26.13.1** against `engines: >=22.11.0 <23`, and pnpm warns on every command.
  - `packages/db` is an empty directory.
  - The root `typecheck` script covers `packages/*` and `apps/web` only, not mobile, studio or admin.
- **Required regression test:** CI must run `pnpm install --frozen-lockfile` on Node 22, then `pnpm typecheck`, on a clean checkout.

### F-11 — Rights expiry not enforced after publication

- **Original finding:** the rights check ran only inside the publish trigger at the moment of publishing (`if old.status = 'published' then return new`). `stations_select_public` and `station_is_public` never re-checked rights. A station whose licence expired, was withdrawn or was edited stayed public, and its stream stayed served (P14).
- **Status:** Fixed at the database layer.
- **Files:** `0090`, `0100`, `0110` (`station_has_rights_in_force`, re-created `station_is_public` and `stations_select_public`).
- **Does it still exist?** No. Public visibility of the station, its streams, programmes and schedules now requires a staff-verified rights record in force today for UG.
- **Evidence:** P14 rows 1 → 0. Regression F-11 (2 assertions) and F-3 ("evidence back under review leaves the directory").
- **Remediation still needed:** notify broadcasters and ops before expiry (a 30/7/1-day job), and decide whether an expiring station shows "temporarily unavailable" or disappears. The current behaviour is that it disappears.
- **Required regression test:** F-11 block.

### F-12 — Web gates are client-side only

- **Original finding:** the web app has **no authentication and no backend**. Every control is enforced only in the browser:
  - The radio rights gate is `playableEndpoint()` in `apps/web/lib/data/streams.ts`.
  - Studio and admin roles are a `<select>` labelled "Simulated role".
  - Review, approval, moderation and station verification are `localStorage` writes (`apps/web/lib/studio/store.tsx`).
  - `/admin/*` is reachable by anyone.
  - The full stream registry, including the URLs of the six **unlicensed** broadcaster streams, ships in the public JS bundle (found in `.next-build/static/chunks/7374-*.js`).
- **Status:** Open, and acceptable only as a clearly labelled local demo.
- **Does it still exist?** Yes. **No front-end change can fix it**, and none should be presented as a fix. The UI copy is honest about it ("Roles and permissions are simulated locally. No authentication exists in this build."). This audit corrected the places where the copy was not honest (see the Engineering Audit, "Changes made").
- **Remediation:**
  - Replace `STREAM_REGISTRY` with server-side reads of `public.station_streams`, where RLS (now fixed) serves only `playable` streams of public stations.
  - Put Supabase Auth in front of `/studio` and `/admin` with server-side session checks (middleware plus RSC), and route every studio and admin write through RLS-protected tables or RPCs.
  - Until real rights exist, **remove unlicensed endpoint URLs from client code**. Keep the evidence in a server-only module or the database.
- **Required regression test:** a build-artefact check: `grep -r` over `.next*/static` for any `station_streams` URL whose rights aren't `broadcaster_authorised` must find nothing. Add Playwright tests asserting `/admin` redirects anonymous users once auth exists.

### F-13 — Media pipeline bypass and cross-tenant object keys

- **Original finding:** `media_insert_owner` and `media_update_owner` allow any org member (including `analyst`) to insert or update every column. A client could register an asset as `ready` without upload, scanning or transcoding; set `quarantined` → `ready`; and set `storage_key` to **another tenant's** object key. The last one would let a future signed-URL function hand out that tenant's private file.
- **Status:** Fixed at the database layer.
- **Files:** `0020`, `0100`, `0110` (`media_assets_guard_trust`, `guard_media_ownership`).
- **Does it still exist?** No.
  - Clients may only register a `pending_upload` asset on `r2`, under `org/<owner_org_id>/…` or `user/<owner_profile_id>/…`.
  - Status, `is_public`, checksum, provider id, location and ownership are immutable to clients.
  - Registering external URLs is platform-only.
- **Evidence:** P10 → DENIED. Regression F-13 has 5 assertions, including "a member can still register a pending upload under their org prefix". The original P10b probe ("un-quarantine") reported ALLOWED after the fix, but only because it set `ready` → `ready`, which is no change. The regression test uses a real status change and is refused.
- **Remediation still needed:** the upload edge function must issue presigned R2 PUTs **only** for the caller's prefix and verify the object after upload (size, magic bytes, AV scan) before a trusted writer moves it on. Also decide whether `analyst` and `billing` members should be able to register uploads at all; today any accepted member can.
- **Required regression test:** F-13 block.

### F-14 — Creator trust fields and unreviewed publishing

- **Original finding:** creators could insert themselves as `verification_status='verified'` and `monetisation_status='active'`, award their own channel `is_verified` badge, inflate `view_count_cached` and `play_count_cached`, and set `podcasts.monetisation_status`. Separately, `channels_write_owner`, `videos_write_owner` and `podcasts_write_owner` let creators publish channels, videos and podcasts directly with no review state, while the studio UI shows a review workflow.
- **Status:** Partially fixed.
- **Files:** `0040`, `0050`, `0100`, `0110` (guard triggers on creators, creator_channels, podcasts, videos, podcast_episodes).
- **Does it still exist?** Trust fields: **no**. Publishing without review: **yes** (P12 still ALLOWED). Creator content is post-moderated at the database layer, which contradicts the studio UI's pre-review workflow.
- **Evidence:** P11, P13, P13b → DENIED. Regression F-14 has 5 assertions.
- **Remediation:** decision D-4. Either:
  - **(a)** add a `pending_review` → `published` transition that only moderators can perform, for channels, videos, podcasts and episodes, mirroring the station publish gate; or
  - **(b)** accept post-moderation and remove the pre-review UI.

  Option (a) is recommended for launch: verified broadcasters get direct publish, and new creators go through review.
- **Required regression test:** with (a), a creator can't move content to `published`, and a moderator can.

### F-15 — Platform hardening

- **Original finding:**
  - **Headers:** `next.config.mjs` sets `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy` (microphone=self), but there is **no CSP and no HSTS**.
  - **Anonymous writes:** `anon` can `INSERT` into `playback_events` and `content_reports` with no rate limit. Probe P16 inserted 1 000 events for an **unpublished** station in one statement.
  - **Exposed helpers:** `app_private` is granted `USAGE` and `EXECUTE` to `anon` (contrary to its own schema comment). For example, `station_org_id()` resolves the organisation of a draft station. The risk is low **as long as `app_private` is never added to PostgREST's exposed schemas**, because policies need that grant to run.
  - **Contact details:** verified organisations' `contact_email` and `contact_phone` are publicly readable.
- **Status:** Open.
- **Remediation:**
  - Add a CSP with nonces (`media-src` allow-listed per rights-cleared stream origin) and HSTS at the edge.
  - Move anonymous telemetry and reports behind an edge function with per-IP and per-session rate limits and Turnstile on reports. Restrict `playback_events` inserts to public targets.
  - Pin "`app_private` not exposed" in the Supabase config and in a CI check.
  - Decide D-5 (public organisation contacts).
- **Required regression test:** a header test against `next start` (CSP and HSTS present); an RLS test that `anon` can't insert a `playback_events` row for a non-public station; a config test that `app_private` is absent from `db.schemas`.

---

## Other observations (not numbered)

- **Missing audit coverage.** `0090` audits `organisations`, `stations`, `campaigns`, `rights_records`, `verification_requests`, `platform_roles` and `payouts`, but **not** `organisation_members`, `station_streams`, `media_assets` or `organisation_invitations`, which are the tables involved in F-2, F-4, F-5 and F-13. Add them to the audit trigger list.
- **Anonymous profile on upgrade.** `handle_new_user` skips anonymous users, and no trigger creates a profile when an anonymous user later converts (`is_anonymous` true → false). Add an `UPDATE` trigger or handle it in the sign-up RPC.
- **`placements_read` is `using (true)`.** That contradicts the 0100 header claim of "no `using (true)` anywhere". It is harmless (placement catalogue), but fix the claim.
- **Outdated security model doc.** `docs/security/security-model.md` "What is implemented today" claimed "RLS on every table" and "SSRF guard on every user-supplied URL". Both were inaccurate before this audit. This document supersedes those claims.

## Changes made to security posture in this audit

| File | Change |
|---|---|
| `supabase/migrations/0110_security_hardening.sql` (new) | Trusted-writer model, guard triggers, re-created membership, station and media policies, invitation RPC, profile column grants, `is_public`, partition lockdown |
| `supabase/tests/rls/07_security_regressions.sql` (new) | 64 assertions covering F-1 to F-8, F-11, F-13 and F-14, with positive controls |
| `supabase/tests/rls/03_publish_gate.sql` (updated) | No longer encodes tenant self-attestation as correct. The stream monitor and platform admin are now explicit actors |
| `supabase/tests/fixtures/00_seed.sql` (updated) | Flags the fixture artwork `is_public` |
| `packages/validation/src/common.ts`, `security.test.ts` | F-9 literal SSRF fix, plus `isReservedIpAddress` for resolved addresses |
