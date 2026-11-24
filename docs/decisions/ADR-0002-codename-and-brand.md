# ADR-0002 — Neutral codename; brand from configuration only

**Date:** 2026-11-18 · **Status:** Accepted (commercial name still undecided)

## Context
The commercial name is not final. The repository directory is named
"SYNAPSE Player", but the product must not inherit another platform's identity
or infrastructure, and hardcoded names are expensive to unwind later.

## Decision
- Internal codename: **kito**. npm scope `@kito/*`. Storage prefixes `kito/`.
- Every user-facing string reads from `packages/config/src/brand.ts`, which is
  overridable through `NEXT_PUBLIC_BRAND_*` and `BRAND_*` environment variables.
- `isPlaceholderBrand()` returns true while placeholder identity is in use, so
  launch checks can fail loudly.
- The repository location is unchanged (`/home/ebrine/dev/SYNAPSE Player`) to
  avoid disturbing an existing directory; the git repository inside it is new
  and independent.

## Consequences
Renaming the product is an environment change plus store metadata, not a
codebase refactor. Nothing outside `packages/config` may contain a brand string;
reviewers should reject PRs that do.

## Follow-ups
Register the final name, domain and social handles before store submission.
