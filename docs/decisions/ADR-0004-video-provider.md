# ADR-0004 — Cloudflare Stream for MVP video delivery

**Date:** 2026-11-18 · **Status:** Accepted, pending a vendor quote

## Context
Video needs transcoding, adaptive renditions, thumbnails, captions and global
delivery. Building this is months of work and a dedicated on-call burden.

## Options
| | Cloudflare Stream | Mux | Self-hosted (ffmpeg + R2 + CDN) |
|---|---|---|---|
| Encoding | automatic | automatic, more control | ours to build and operate |
| Delivery | per minute delivered, included CDN | metered per rendition | R2 egress (free) + compute |
| Analytics | basic | excellent (QoE, rebuffering) | none |
| Vendor surface | already using R2/Workers | additional vendor | none |
| Ops burden | low | low | high |

## Decision
Cloudflare Stream for the MVP. Cost is predictable per minute rather than per
gigabyte, which suits a low-ARPU market, and it consolidates vendors with R2,
Workers and DNS.

**Pricing in the discovery report is indicative and must be confirmed against a
current quote before any commitment.** The abstraction is `video_assets` with a
`provider` column, so Mux remains a supported backend if QoE analytics or DRM
later justify the switch.

## Consequences
- Renditions and captions are described by provider webhooks into `video_assets`.
- No vendor SDK leaks into the apps; they read `playback_hls_url` only.
