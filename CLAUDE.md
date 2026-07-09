# CLAUDE.md

Guidance for AI coding assistants (and a quick orientation for humans) working
in this repository. For the full picture, see [`README.md`](./README.md) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Language & tooling

Node.js (v22+) with TypeScript, run directly via `tsx` — no separate build
step. Package management via npm; dependencies are in `package.json` /
`package-lock.json`.

## Test command

`npm test` — runs Node's built-in test runner over `src/**/*.test.ts` via
`tsx`. Tests run against fixture data, never live feed endpoints.

## Conventions

- One folder per feed: `src/feeds/<feed>/` (`gdacs`, `usgs`, `reliefweb`),
  each with an `index.ts` entry point that fetches, filters, and renders.
- Cross-feed logic (Southeast Asia scope: country list, bounding box, HTML
  helpers) lives in `src/shared/` — feed folders import it, never redefine
  it. See `docs/adr/0001-sea-country-list.md` and
  `docs/adr/0002-sea-bounding-box.md`.
- Each feed's generated events page is committed at `events/<feed>.html`
  (parallel to `dashboard-map.html`, per `.gitignore`'s generated-reports
  exception).
- Domain vocabulary (Story, Triage severity, Story state, etc.) is defined
  in `CONTEXT.md` — use it in code and comments rather than inventing
  synonyms.

## Deviations policy

Anything built that departs from the PRD (`docs/design/prd.html`) or an ADR
(`docs/adr/*.md`) is recorded in `docs/design/implementation-notes.md` under
"Deviations," with the reason. An undocumented deviation is a bug.
