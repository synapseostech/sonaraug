# Workstation audit (2026-11-18)

Recorded before any implementation, as required by the project rules.

| Item | Finding | Consequence |
|---|---|---|
| OS | Linux Mint 22.3 (Ubuntu 24.04 base), kernel 7.0.0-43 | — |
| CPU / RAM | i7-5600U (2c/4t), 11 GiB RAM, swap full at audit time | Serialise heavy builds; no local video transcode |
| Node | v26.13.1 default; **v22.23.5 installed during this phase** | Repo pinned to 22 (`.nvmrc`, `engines`) |
| pnpm | 12.21.0 (installed under Node 26 only) | Invoke via the v26 binary path, or `corepack enable` under 22 |
| Docker | 29.10.0 installed, zero images | Not used; image pulls failed with connection resets |
| PostgreSQL | server 16.15 binaries present; local cluster running but no usable role for this user | Test harness uses `initdb` in `.tmp/`, no sudo needed |
| Supabase CLI | **absent**; no access token | Cannot create projects or run `supabase start` |
| Vercel CLI | 66.0.0, authenticated as `synapseostech-5131`, team `synapse-os1` | 3 existing projects, none for this product |
| Cloudflare / Mux / Sentry / PostHog | no credentials present | Not provisioned |
| ffmpeg / ffprobe | absent | Media probing must be server-side |
| Java / Android SDK / adb / Xcode | absent | Native builds must use EAS Build |
| GitHub | `gh` authenticated as `synapseostech`, HTTPS (no SSH keys) | Repo not created on GitHub |
| Git identity | unset globally | Set repository-locally for this project |
| Existing repos | `SYNAPSE-OS` (clean), `surbub` (clean), `Pearledu` (**uncommitted work**), `freellmapi` | Not touched |

## Outstanding prerequisites before Phase 3

1. Supabase project + `SUPABASE_ACCESS_TOKEN` (separate from the health platform).
2. Cloudflare account with R2 + Stream + Workers.
3. Expo/EAS account; Apple Developer and Google Play accounts.
4. Real Ugandan stream URLs / RSS feeds for verification (no fabricated stations).
5. Approval of monthly infrastructure budget.
