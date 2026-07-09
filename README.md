# HADR Monitor

An unattended monitoring agent for **humanitarian assistance and disaster
response (HADR)**, focused on Southeast Asia. It watches three public disaster
feeds — [GDACS](https://www.gdacs.org/), [USGS](https://earthquake.usgs.gov/),
and [ReliefWeb](https://reliefweb.int/) — reconciles the same physical event
across them into a single *story*, triages severity, tracks what changed since
the last run, and publishes an interactive daily situation report.

It sits at the **sensing layer only**: it watches, reconciles, and reports. It
does not dispatch aid or decide a response — it produces the input a human
decision-maker (or a downstream agent) needs before they can act.

> **Scope note.** "Southeast Asia" here means the ASEAN ten (Brunei, Cambodia,
> Indonesia, Laos, Malaysia, Myanmar, Philippines, Singapore, Thailand,
> Vietnam) plus Timor-Leste. See
> [`docs/adr/0001-sea-country-list.md`](docs/adr/0001-sea-country-list.md).

## Contents

- [Features](#features)
- [Architecture](#architecture)
  - [Data sources](#data-sources)
  - [Processing pipeline](#processing-pipeline)
  - [Frontend / outputs](#frontend--outputs)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Development](#development)
- [How it works](#how-it-works)
- [Data attribution & licensing](#data-attribution--licensing)
- [Contributing](#contributing)

## Features

- **Multi-hazard coverage** — earthquakes, tropical cyclones, floods,
  volcanoes, drought and wildfires (GDACS), plus a dedicated, more reliable
  earthquake channel (USGS) and human-curated confirmation (ReliefWeb).
- **Cross-source reconciliation** — the same earthquake arriving from GDACS
  and USGS under different identifiers is merged into one *story* via the
  earthquake join (GDACS `sourceid` ↔ USGS `ids`) rather than reported three
  times.
- **Severity triage** — GDACS alert colours and USGS PAGER alerts are combined
  into a single triage severity; low-signal (Green-tier) noise is suppressed
  from the report but still tracked.
- **State tracking** — every story runs through a state machine (new /
  escalated / de-escalated / revised / confirmed / deleted) so the report can
  show *what changed since yesterday*, not just a fresh list.
- **Graceful degradation** — feeds go down, get rate-limited, or serve garbage
  (GDACS is known to be flaky). The report still publishes, stating per-feed
  what it could and could not see.
- **Self-contained output** — the dashboard embeds its map, flags, country
  summaries and satellite imagery as inline data, so the published page makes
  no view-time network requests.
- **Machine-readable twin** — every published report is accompanied by a JSON
  payload for downstream consumers.
- **Scheduled & unattended** — a GitHub Actions workflow rebuilds and
  republishes the report every morning, and stays quiet when nothing changed.

## Architecture

```
          DATA SOURCES                 PROCESSES                     OUTPUTS
  ┌───────────────────────┐   ┌───────────────────────────┐   ┌──────────────────┐
  │ GDACS  (multi-hazard) │   │ collect   fetch + SEA-scope│   │ dashboard-map.html│
  │ USGS   (earthquakes)  │──▶│ reconcile merge into stories│─▶│ dashboard-map.json│
  │ ReliefWeb (curated)   │   │ state     diff vs last run  │   │ events/<feed>.html│
  └───────────────────────┘   │ imagery   NASA GIBS scenes  │   │ state.json (cursor)│
  enrichment: Wikipedia,       │ render    HTML + JSON       │   └──────────────────┘
  flagcdn, NASA GIBS           └───────────────────────────┘
```

### Data sources

| Source | Role | Access | Auth |
| --- | --- | --- | --- |
| [GDACS](https://www.gdacs.org/) | Multi-hazard alerts (EQ, TC, FL, VO, DR, WF) | GeoJSON event list | None (public) |
| [USGS](https://earthquake.usgs.gov/) | Earthquakes, PAGER alerts | FDSN event query (GeoJSON), bounding-box scoped | None (public) |
| [ReliefWeb](https://reliefweb.int/) | Human-curated disaster confirmation | RSS feed (with fixture fallback) | None for RSS |
| [NASA GIBS / Worldview](https://worldview.earthdata.nasa.gov/) | Satellite imagery for alerted areas | Snapshot API | None (public) |
| [Wikipedia REST](https://en.wikipedia.org/api/rest_v1/) | Country summaries (build-time only) | REST summary API | None (public) |
| [flagcdn.com](https://flagcdn.com/) | Country flag images (build-time only) | Static PNGs | None (public) |

**No API keys are required.** Every source is consumed through a public,
unauthenticated endpoint. ReliefWeb's authenticated JSON API (which needs a
pre-approved `appname`) is intentionally *not* used — the project reads the
open RSS feed and falls back to a bundled fixture if that fails, always
disclosing which source produced the page
([ADR-0013](docs/adr/0013-reliefweb-adapter-and-fixture-fallback.md)).

Per-source reference notes — endpoints, example payloads and operational
gotchas — live in [`feeds/`](feeds/), and the cross-cutting reliability
hazards in [`feeds/blindspots.md`](feeds/blindspots.md).

### Processing pipeline

The dashboard build (`npm run build:dashboard`, source in
[`src/dashboard/`](src/dashboard/)) is a single deterministic pass, not a
long-running daemon
([ADR-0010](docs/adr/0010-scheduled-ticks-not-long-running-daemon.md)):

1. **Load state** — read `state.json`, the persisted record of the previous
   run and its per-feed cursors
   ([ADR-0012](docs/adr/0012-json-file-persistence.md)).
2. **Collect** — fetch all three feeds, filtered to the Southeast Asia scope;
   the USGS window is extended back to the last successful cursor so downtime
   is recoverable ([ADR-0011](docs/adr/0011-per-feed-cursor-advances-only-on-success.md)).
3. **Reconcile** — merge feed records into *stories*, joining GDACS and USGS
   earthquakes that describe the same event.
4. **State machine** — diff the current stories against the prior run to label
   each as new / escalated / de-escalated / revised / confirmed / deleted
   ([ADR-0005](docs/adr/0005-story-state-machine.md)).
5. **Imagery** — fetch one satellite scene per alerted story from NASA GIBS and
   embed it as a data URI; failures degrade silently
   ([ADR-0018](docs/adr/0018-satellite-imagery-gibs-embedded.md)).
6. **Render & persist** — write `dashboard-map.html`, `dashboard-map.json` and
   the new `state.json`.

The individual per-feed fetchers (`npm run fetch:gdacs`, `fetch:usgs`,
`fetch:reliefweb`, source in [`src/feeds/`](src/feeds/)) are simpler: each
fetches one feed, filters to scope, and renders a standalone
`events/<feed>.html` table. They produce raw feed *records*, not reconciled
stories.

### Frontend / outputs

- **`dashboard-map.html`** — the primary product: an interactive SVG map of
  Southeast Asia with plotted event markers, per-country detail panels
  (flag, Wikipedia summary, story counts), a feed-health strip, a
  "Since yesterday" change section, embedded satellite imagery, deep-linkable
  country hashes, keyboard navigation, and light/dark themes. It is fully
  self-contained — no runtime network calls.
- **`dashboard-map.json`** — the same data as a machine-readable payload
  (stories with state, feed health, since-yesterday changes) for downstream
  agents.
- **`events/<feed>.html`** — one plain table per feed, produced by the
  individual fetchers.

The vocabulary used throughout the UI and the code (Story, Triage severity,
Story state, Feed health strip, …) is defined in
[`CONTEXT.md`](CONTEXT.md).

## Repository layout

```
.
├── src/
│   ├── feeds/            # per-feed fetchers: gdacs/, usgs/, reliefweb/
│   ├── dashboard/        # the reconciliation + report pipeline
│   └── shared/           # cross-feed logic: SEA scope, HTML helpers, Story type
├── events/               # generated per-feed HTML tables (committed)
├── scripts/              # deterministic checks (browser e2e)
├── feeds/                # data-source reference docs + reliability blindspots
├── docs/
│   ├── adr/              # Architecture Decision Records (the design record)
│   ├── design/           # archived planning docs (PRD, requirements, notes)
│   └── solutions/        # short how-to notes
├── .github/workflows/    # CI, scheduled publish, Pages deploy
├── dashboard-map.html    # generated situation report (committed product)
├── dashboard-map.json    # machine-readable twin (committed)
├── state.json            # persisted run state / cursors (committed)
├── CONTEXT.md            # domain vocabulary
├── ARCHITECTURE.md       # architecture overview
└── CLAUDE.md             # guidance for AI coding assistants
```

## Getting started

### Prerequisites

- **Node.js v22+** (uses the built-in test runner and native `fetch`).
- **npm** (ships with Node).
- For the browser end-to-end check only: a **Chrome/Chromium** install
  (Playwright drives the system browser via `channel: "chrome"`).

### Install

```bash
git clone https://github.com/<your-org>/hadr-monitor.git
cd hadr-monitor
npm install
```

### Run the checks

```bash
npm run typecheck     # tsc --noEmit
npm test              # Node's test runner over src/**/*.test.ts (fixture data)
```

Tests run entirely against bundled fixtures — they never touch live feeds.

### Build a report

```bash
npm run build:dashboard
```

This fetches the three live feeds and writes `dashboard-map.html`,
`dashboard-map.json` and `state.json`. Open `dashboard-map.html` in a browser
to view the report. (On a morning when a feed is down, the build still
succeeds and the report says so.)

You can also build a single feed's events table:

```bash
npm run fetch:gdacs      # -> events/gdacs.html
npm run fetch:usgs       # -> events/usgs.html
npm run fetch:reliefweb  # -> events/reliefweb.html
```

## Configuration

The application needs **no secrets and no API keys** to run. All feed and
enrichment endpoints are public. The only configuration is a handful of
optional environment variables, all consumed by the browser e2e check:

| Variable | Used by | Required | Description |
| --- | --- | --- | --- |
| `E2E_BASE` | `npm run e2e` | Yes (for e2e) | URL of the deployed dashboard to test, e.g. `https://<user>.github.io/<repo>/` or `http://127.0.0.1:8080/dashboard-map.html`. |
| `E2E_HEADED` | `npm run e2e` | No | Set to any value to watch the browser run headed and slowed down. |

See [`.env.example`](.env.example) for a copy-paste starting point. Secrets, if
you ever add any, belong in an untracked `.env` file (already git-ignored) or
in your CI provider's secret store — never committed.

### CI secrets

The optional GitHub Actions workflows for the `@claude` code assistant
(`.github/workflows/claude*.yml`) expect a repository secret named
`CLAUDE_CODE_OAUTH_TOKEN`. It is only needed if you want that assistant; the
monitor itself does not use it. The scheduled publish and Pages workflows use
the built-in `GITHUB_TOKEN` and need no extra secrets.

## Deployment

The report is a static, self-contained page, so hosting is trivial — any
static host works. The repository ships with a GitHub-native setup:

### Scheduled publishing (GitHub Actions + Pages)

[`.github/workflows/sitrep.yml`](.github/workflows/sitrep.yml) runs every day
at **08:30 Asia/Singapore (00:30 UTC)**. Each run:

1. Type-checks and tests the code.
2. Rebuilds the report against the live feeds (`npm run build:dashboard`).
3. Commits the new `dashboard-map.html` / `.json` / `state.json` snapshot
   (only if something changed).
4. Deploys the page to GitHub Pages.
5. Verifies the *live* deployed page with the browser e2e check.

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) additionally
redeploys whenever the committed dashboard files change on `main`.

To enable it on your fork:

1. Push to GitHub and enable **Pages** for the repository
   (Settings → Pages → Source: *GitHub Actions*).
2. Ensure Actions have write permission
   (Settings → Actions → General → Workflow permissions: *Read and write*).
3. The scheduled workflow will publish to
   `https://<your-user>.github.io/<your-repo>/`. Trigger it manually the first
   time via the Actions tab (**Run workflow**).

### Other hosts

Because `dashboard-map.html` and `dashboard-map.json` are committed artifacts
with no runtime dependencies, you can also serve them from Netlify, Vercel,
S3/CloudFront, or any web server — point the host at the repository root (or
copy those two files plus rename `dashboard-map.html` to `index.html`). Run
`npm run build:dashboard` on your own schedule (cron, a scheduled function,
etc.) to refresh them.

## Development

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests (fixtures only). |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm run build:dashboard` | Build the full situation report from live feeds. |
| `npm run fetch:gdacs` / `:usgs` / `:reliefweb` | Build one feed's events table. |
| `npm run generate:country-info` | Regenerate the committed country flags/summaries module (network; run manually). |
| `E2E_BASE=<url> npm run e2e` | Drive a deployed dashboard with a real browser. |

There is **no build step** — TypeScript is executed directly via
[`tsx`](https://github.com/privatenumber/tsx). Conventions (one folder per feed,
shared logic in `src/shared/`, domain vocabulary from `CONTEXT.md`) are
documented in [`CLAUDE.md`](CLAUDE.md).

## How it works

The *why* behind each significant choice is recorded as an Architecture
Decision Record in [`docs/adr/`](docs/adr/) — scope definitions, the earthquake
join, triage rules, the state machine, correction policy, persistence,
scheduling, and satellite imagery. Start there (and with
[`ARCHITECTURE.md`](ARCHITECTURE.md)) if you want to understand or extend the
system. The original planning documents are archived under
[`docs/design/`](docs/design/).

## Data attribution & licensing

This project consumes third-party data under their respective terms. If you
deploy it, you inherit those obligations:

- **GDACS** — © European Union / United Nations; alerts are public.
- **USGS** — earthquake data is US Government public domain.
- **ReliefWeb** — © UN OCHA. Report content is redistribution-restricted, so
  the dashboard only ever shows a one-sentence own-words paraphrase with
  attribution and a link back — never a direct quote
  ([ADR-0015](docs/adr/0015-zero-reliefweb-quotes.md)).
- **NASA GIBS imagery** — public domain (NASA); attributed in the caption with
  a link to NASA Worldview.
- **Wikipedia summaries** — CC BY-SA 4.0; the country panel attributes and
  links back to the source article.
- **Flags** — [flagcdn.com](https://flagcdn.com/) / Flagpedia, public domain.

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
workflow, coding conventions, and how to add a new feed or output surface.
