# Architecture

This document describes how the HADR Monitor is put together: its data flow,
modules, and the key domain types. For the *why* behind individual decisions,
see the Architecture Decision Records in [`docs/adr/`](docs/adr/); for the
domain vocabulary, see [`CONTEXT.md`](CONTEXT.md).

## Overview

The system is a **batch pipeline**, not a service. Each run is a single
deterministic pass that reads persisted state, fetches the feeds, produces a
report, and writes the new state back
([ADR-0010](docs/adr/0010-scheduled-ticks-not-long-running-daemon.md)). A
scheduler (GitHub Actions) invokes it; the code never runs as a daemon and
never decides on its own whether to wake up.

```
                    ┌──────────────────────────────────────────────┐
   state.json ─────▶│                                              │
                    │  src/dashboard/index.ts  (build:dashboard)   │
  GDACS ┐           │                                              │
  USGS  ├──fetch──▶ │  collect → reconcile → state machine →       │─┬─▶ dashboard-map.html
  ReliefWeb ┘       │  imagery → render                            │ ├─▶ dashboard-map.json
                    │                                              │ └─▶ state.json (updated)
   NASA GIBS ──────▶│                                              │
                    └──────────────────────────────────────────────┘
```

There are two entry surfaces:

- **The dashboard build** (`src/dashboard/`) — the full stateful pipeline that
  produces the situation report.
- **The per-feed fetchers** (`src/feeds/<feed>/index.ts`) — simpler, stateless
  scripts that each render one feed's raw *records* to `events/<feed>.html`.
  They share the scope and HTML helpers but do no reconciliation.

## The pipeline (`src/dashboard/`)

`index.ts` orchestrates the run in order:

| Step | Module | Responsibility |
| --- | --- | --- |
| Load state | `state.ts` | Read `state.json`: prior stories + per-feed cursors ([ADR-0012](docs/adr/0012-json-file-persistence.md)). |
| Collect | `collect.ts` | Fetch all three feeds, filtered to Southeast Asia scope; extend the USGS window back to the last successful cursor so downtime is recoverable ([ADR-0011](docs/adr/0011-per-feed-cursor-advances-only-on-success.md)). Records per-feed health. |
| Reconcile | `reconcile.ts` | Merge feed records into `Story` objects, joining GDACS + USGS earthquakes for the same event; attach ReliefWeb supplementary links. |
| Triage | `triage.ts` | Derive each story's triage severity across feeds ([ADR-0007](docs/adr/0007-triage-severity-shows-both-takes-max.md)) and its suppression flag ([ADR-0008](docs/adr/0008-green-tier-suppression.md)). |
| State machine | `state.ts` | Diff current stories against the prior run: new / escalated / de-escalated / revised / confirmed / deleted ([ADR-0005](docs/adr/0005-story-state-machine.md)), producing the "Since yesterday" changes ([ADR-0006](docs/adr/0006-explicit-correction-policy.md)). |
| Imagery | `imagery.ts` | Fetch one NASA GIBS satellite scene per alerted story, embedded as a data URI; failures degrade silently ([ADR-0018](docs/adr/0018-satellite-imagery-gibs-embedded.md)). |
| Render | `render.ts`, `map.ts` | Build the HTML report (interactive SVG map, country panels, feed-health strip, since-yesterday section) and the JSON twin. |
| Persist | `state.ts` | Write the new `state.json` for the next run to diff against. |

Supporting modules:

- `map.ts`, `sea-geojson.ts` — the SVG map: country geometry, marker plotting,
  bounding box.
- `country-info.ts` — committed, generated module of country flags + Wikipedia
  summaries, produced by `generate-country-info.ts` (`npm run
  generate:country-info`). This is the *only* part of the country enrichment
  that touches the network, and it is run manually — the dashboard build reads
  the committed module and stays offline/self-contained.

## Shared logic (`src/shared/`)

Cross-feed logic lives here so it is defined once, never re-derived per feed:

- **`sea-scope.ts`** — the Southeast Asia definition: the ISO-3 country set
  ([ADR-0001](docs/adr/0001-sea-country-list.md)) and the bounding box for
  feeds without a country field ([ADR-0002](docs/adr/0002-sea-bounding-box.md)),
  with `isCountryInScope()` / `isPointInScope()` helpers.
- **`story.ts`** — the `Story` type and the alert-tier model (`AlertTier`,
  `TIER_RANK`, `toTier()`, `maxTier()`). A `Story` is the dashboard's unit: the
  reconciled view of one physical disaster, carrying a cross-feed triage
  severity and a suppression flag.
- **`html.ts`** — HTML escaping and the shared page shell.

## Per-feed fetchers (`src/feeds/`)

Each feed has its own folder with an `index.ts` entry point that fetches,
filters to scope, and renders. They are deliberately independent:

- **`gdacs/`** — parses the GDACS GeoJSON event list defensively (schema drift
  is logged, not fatal), collecting ISO-3 codes from multiple fields.
- **`usgs/`** — queries the USGS FDSN API with a server-side bounding box, then
  re-checks each point client-side as a defensive guard.
- **`reliefweb/`** — fetches the RSS feed with a browser User-Agent, falling
  back to a bundled fixture and always disclosing the source
  ([ADR-0013](docs/adr/0013-reliefweb-adapter-and-fixture-fallback.md)). Split
  into `adapter.ts` (fetch), `xml.ts` (parse), `transform.ts` (scope filter),
  and `render.ts`.

## Design principles

- **Defensive parsing.** Feeds drift and misbehave; unknown fields are
  tolerated, malformed records are skipped and logged rather than crashing the
  run. See [`feeds/blindspots.md`](feeds/blindspots.md).
- **Honest degradation.** A bad feed morning still publishes a report that
  states, per feed, what it could and could not see. Silence must mean
  "nothing new", never "it crashed".
- **Self-contained output.** The published page embeds its map, flags,
  summaries and imagery — no view-time network requests, so the reviewed
  artifact is exactly what ships.
- **Deterministic core, model-free.** The pipeline is pure TypeScript with no
  model calls; anything that must give the same answer twice is code, not a
  prompt.

## Testing

Unit tests live beside the code as `*.test.ts` and run on Node's built-in test
runner via `tsx` (`npm test`). They exercise parsing, scope filtering,
reconciliation, triage, the state machine, and rendering **against fixtures
only** — never live endpoints. The browser end-to-end check
(`scripts/e2e-hosted.js`, `npm run e2e`) drives a *deployed* page with a real
browser and is used as post-deploy verification in CI.

## Extending

- **A new data source** → add `src/feeds/<feed>/`, reuse `src/shared/`
  scope + HTML helpers, and (if it should appear in the reconciled report)
  teach `collect.ts` / `reconcile.ts` about it. Record an ADR for any new
  identity or severity rules.
- **A new output surface** → add a renderer alongside `render.ts`; the
  `buildStructuredOutput()` JSON is the stable contract for downstream
  consumers.
