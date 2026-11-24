# Admin Platform

**Updated:** 2026-11-23 · `/admin` requires a signed-in account with a staff role, checked on the server. Every page checks its own permission (layouts do not re-run on client navigation) and every action re-checks it in the service layer. Roles are read from the store on **every request**, so a revoked role takes effect immediately.

## 1. Roles and permissions

| Role | Can |
|---|---|
| `super_admin` | Everything, incl. granting/revoking `admin`/`super_admin`, suspending staff, toggling live payments |
| `admin` | Everything except the above |
| `finance` | Users (read), plans and promotions, subscriptions (read), entitlement adjustments, payments, reconciliation, refunds, audit log |
| `moderator` | Users (read), moderation, creator application review |
| `support` | Users (read), subscriptions (read), payments (read) |
| `medical_reviewer` | Medical Chronicles edit + review/approve/publish/withdraw, medical review records, series access rules |
| `content_editor` | Medical Chronicles drafting and editing only |

Privilege separation (`packages/auth/src/staff.ts`, DB `grant_platform_role` / `revoke_platform_role`): nobody changes their own roles; only a super admin grants or revokes admin roles; the last super admin cannot be removed; nobody suspends themselves; only a super admin suspends staff. All tested (unit + DB + browser).

**Bootstrapping the first super admin** (local development): register normally, then `pnpm sonara:dev grant <email> super_admin`. The grant is audited as `role.grant.local_cli`. In production this will be a one-off, audited database operation by the owner.

## 2. Sections

| Section | Route | Status | Notes |
|---|---|---|---|
| Overview | `/admin` | **Real** | Users, premium listeners, staff, active subscriptions (paid vs trial/unpaid), MRR and collections **split into live vs test/simulated** (only live is revenue), failed payments, MC published / awaiting review, recent audit events, and an explicit "not yet on the backend" list |
| Users | `/admin/users`, `/admin/users/[id]` | **Real** | Search by email/name/id, filter by role/status, pagination; detail: account, verification, sessions, terms version, subscriptions, payments (finance/support/admin only), adjustments, audit history; role grant/revoke and suspend/reactivate with reasons |
| Audit log | `/admin/audit-logs` | **Real** | Filter by action, entity, actor; before/after diff; request id; **hash-chain integrity check** shown on every load |
| Settings | `/admin/settings` | **Real** | Default free allowance, free-requires-account, authorised audio hosts, grace days, trials, live payments (super admin), maintenance mode, policy versions; credential **presence** report (never values); storage/email/infra status. Every save needs a reason and is audited with before/after |
| Medical Chronicles | `/admin/medical-chronicles` (+ series, episodes, review queue, categories) | **Real** | See SONARA_MEDICAL_CHRONICLES.md |
| Plans & subscriptions | `/admin/subscriptions` | **Real** | Plans (create/edit, creator limits, placeholder flag, create Flutterwave card plan), promotional codes, subscriptions with state filter, manual entitlement adjustments with reasons, revoke, billing jobs |
| Payments | `/admin/payments` | **Real** | Reconciliation issues, re-verify pending, transactions (filter by status and live/test/simulator), refund requests and decisions, webhook delivery log (signature, processing, deliveries, key, error), forged-webhook self-test (simulator only). No "mark as paid" exists |
| Review (demo data) | `/admin/review`, `stations`, `content`, `creators`, `rights`, `reports`, `history` | **Simulated** | Pre-existing screens on browser storage, tagged "Demo" in the navigation; their "Demo review role" selector affects only these pages |
| Creators, broadcasters, videos, moderation, monetisation, analytics as server-backed sections | — | **Not built** | Roadmap Waves 4–6. The overview says so rather than estimating figures |

## 3. Audit

Every privileged change records actor, actor roles, action, entity, before/after (credentials redacted), reason, request id and time, in a hash chain (`verifyAuditChain`; `pnpm sonara:dev audit-verify`). In Postgres the equivalent `audit_logs` table is append-only by trigger and has no client write grant; commercial and editorial tables have audit triggers (`0120`, `0130`, `0140`).

## 4. Not yet

Two-person approval for destructive admin actions; staff MFA (depends on the auth provider); export of audit logs; scheduled jobs (billing jobs and reconciliation are buttons today); per-section dashboards for creators, broadcasters, video, moderation, advertising and analytics.
