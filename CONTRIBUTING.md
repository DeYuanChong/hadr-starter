# Contributing

Thanks for your interest in improving the HADR Monitor. This guide covers how
to get set up, the conventions the codebase follows, and how to propose a
change.

## Getting set up

```bash
git clone https://github.com/<your-fork>/hadr-monitor.git
cd hadr-monitor
npm install
npm run typecheck && npm test
```

You need **Node.js v22+**. There is no build step — TypeScript runs directly
via [`tsx`](https://github.com/privatenolan/tsx).

## Before you open a pull request

Run both checks and make sure they pass:

```bash
npm run typecheck   # tsc --noEmit — must be clean
npm test            # all tests must pass; they use fixtures, not live feeds
```

If your change affects the rendered dashboard, also build it locally and open
the result:

```bash
npm run build:dashboard   # writes dashboard-map.html / .json / state.json
```

For changes to the interactive page, the browser end-to-end check is the
strongest signal (serve the repo, then point the check at it):

```bash
npx http-server -p 8080 &
E2E_BASE=http://127.0.0.1:8080/dashboard-map.html npm run e2e
```

## Conventions

These are enforced by review; see [`CLAUDE.md`](CLAUDE.md) for the short
version and [`ARCHITECTURE.md`](ARCHITECTURE.md) for the layout.

- **One folder per feed** under `src/feeds/<feed>/`, each with an `index.ts`
  entry point that fetches, filters, and renders.
- **Cross-feed logic lives in `src/shared/`** — the Southeast Asia scope, the
  `Story` type, and HTML helpers are defined once and imported, never
  redefined per feed.
- **Use the domain vocabulary** from [`CONTEXT.md`](CONTEXT.md) (Story, Triage
  severity, Story state, …) in code and comments rather than inventing
  synonyms.
- **Parse defensively.** Feeds drift and misbehave — tolerate unknown fields,
  skip and log malformed records, and never crash a whole run over one bad
  item. See [`feeds/blindspots.md`](feeds/blindspots.md).
- **Keep the output self-contained.** The published page must not make
  view-time network requests; embed assets as data URIs at build time.
- **Tests use fixtures, never live feeds.** Add or update a fixture alongside
  the code and cover new behaviour with a `*.test.ts` beside the module.

## Design decisions

Anything that departs from the PRD ([`docs/design/prd.html`](docs/design/prd.html))
or an existing ADR must be recorded — either as a note in
[`docs/design/implementation-notes.md`](docs/design/implementation-notes.md)
or, for a significant new choice (a new identity/severity rule, a new data
source, a persistence change), as a new ADR in [`docs/adr/`](docs/adr/).
An undocumented deviation is treated as a bug.

## Commit & PR hygiene

- Write clear, imperative commit messages ("Add cyclone-track scope guard",
  not "fixes").
- Keep pull requests focused; describe what changed and why, and note any user-
  or data-visible effects.
- Make sure `npm run typecheck` and `npm test` are green before requesting
  review.

## Reporting issues

Use the issue templates under `.github/ISSUE_TEMPLATE/`. A good bug report says
what you ran, what you expected, and what actually happened — including the
feed and date if it is data-dependent, since feed behaviour changes over time.
