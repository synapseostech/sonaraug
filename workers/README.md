# Workers

Cron-invoked handlers, not servers (ADR-0007). Each directory is a package with a
single exported handler plus its tests; the scheduler is configuration, not code.

| Worker | Trigger | Responsibility | Status |
|---|---|---|---|
| `stream-monitor` | Cloudflare Cron, every 2–5 min | Probe each station endpoint (DNS → TCP → first bytes → content-type → ICY metadata) and write `stream_health_checks`; promote to `playable` only after a successful audio read | Not implemented |
| `rss-import` | Cron + manual "refresh" | Fetch feeds with `ETag`/`If-Modified-Since`, upsert episodes `ON CONFLICT (podcast_id, guid) DO NOTHING`, advance `next_fetch_at` with backoff | Not implemented |
| `media-processing` | Provider webhook | Translate Cloudflare Stream/Mux callbacks into `video_assets` state transitions | Not implemented |
| `notifications` | Event-driven (queue table) | Fan out new-episode pushes to followers, respecting `notification_preferences` and quiet hours | Not implemented |
| `analytics` | Nightly `pg_cron` | Roll up playback events into daily content stats; drop expired partitions | Not implemented |

## Contract every worker follows

```ts
export type WorkerContext = { now: Date; env: Record<string, string | undefined> };
export type WorkerResult = { processed: number; failed: number; notes: string[] };
export type Worker = (ctx: WorkerContext) => Promise<WorkerResult>;
```

No worker imports a client SDK; no worker holds a service-role key in source.
Secrets arrive through environment bindings.
