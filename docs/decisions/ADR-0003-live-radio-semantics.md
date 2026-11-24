# ADR-0003 — Live radio has no seek, pause or catch-up

**Date:** 2026-11-18 · **Status:** Accepted

## Context
Listeners expect a radio player to behave like radio, not like a podcast. Seeking
or rewinding a live Icecast stream requires either server-side time-shift
recording (which needs broadcaster permission and rights clearance) or a
buffer-window hack that breaks on reconnect.

## Decision
The capability model in `packages/media` reports `canSeek: false`,
`canPause: false`, `canChangeSpeed: false`, `hasDuration: false` for
`live_radio`. The UI renders controls from these flags, so a seek bar cannot be
shown by accident. Pause is not modelled at all — stopping and restarting is a
reconnect.

Catch-up, recording and seven-day archives are explicitly out of scope until
(a) the broadcaster grants written permission, (b) rights are cleared for
on-demand retransmission, and (c) time-shift infrastructure exists.

## Consequences
- The reducer ignores `seek`, `setRate` and `pause` for live sources; tests
  assert this.
- Any future catch-up feature must arrive as a *new* source kind
  (`radio_catchup`) with its own capabilities, not by loosening `live_radio`.
