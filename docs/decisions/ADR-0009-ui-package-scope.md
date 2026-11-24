# ADR-0009: `@kito/ui` is a web UI kit, not a cross-platform component library

- **Status**: Accepted
- **Date**: 2026-11-22
- **Supersedes**: the unresolved `@kito/ui` reference recorded in ADR-0001

## Context

`apps/web` and `apps/mobile` both declared `"@kito/ui": "workspace:*"`, but
`packages/ui/` did not exist. That made `pnpm install` impossible at the
workspace root (audit finding F-10) and left a lockfile with no application
importers.

The original intent was a shared component library. React Native and the DOM
have incompatible primitives, and ADR-0001 already records that this project
does not share component code between the two platforms. A package that both
apps import would therefore either contain nothing of substance or force
abstraction that costs more than it saves.

## Decision

`@kito/ui` is a **web UI kit** built on React DOM. It is depended on by
`apps/web` (and later `apps/studio` and `apps/admin`). **`apps/mobile` does not
depend on it**; React Native screens use `@kito/config` tokens directly.

The package owns:

- `cssVariables(theme)` — serialises the colour tokens from `@kito/config` into
  CSS custom properties, so a token change propagates without editing CSS.
- `gradientFor(seed)` / `initials(title)` — deterministic, copyright-free
  artwork placeholders.
- Presentation primitives: `Button`, `IconButton`, `Badge`, `Chip`, `Artwork`,
  `SectionHeader`, `Scroller`, `Skeleton`, `EmptyState`, `ProgressBar`, `Range`.
- An inline `Icon` set (no icon dependency, small bundles for low-end Android).
- `styles.css`, imported once by the consuming app.

Design tokens remain in `@kito/config`. `@kito/ui` never hardcodes a colour.

## Consequences

- Mobile keeps its own React Native components; shared *behaviour* stays in
  `@kito/media`, shared *data shapes* in `@kito/types`.
- `apps/mobile/package.json` no longer lists `@kito/ui`, so the workspace graph
  resolves and `pnpm install` succeeds.
- A future design-system change that must apply to both platforms belongs in
  `@kito/config` (tokens), not in this package.
- `packages/db` remains intentionally empty until database type generation is
  introduced; the dangling `@kito/db` path mapping was removed from the root
  `tsconfig.json` for the same reason.
