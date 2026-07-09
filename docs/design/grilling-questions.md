# Requirements grilling — scratch log

> **Archived design document.** A working log of the open questions raised
> against the [requirements](./requirements.md) and how each was resolved.
> Answered questions are checked off with the decision recorded. This file is
> scratch — the durable outputs are [`CONTEXT.md`](../../CONTEXT.md) and the
> [ADRs](../adr/).

## 1. Geographic scope

- [x] 1.1 Exact SEA country list — **ASEAN-10 + Timor-Leste, PNG and
      southern China out.** See `docs/adr/0001-sea-country-list.md`.
- [x] 1.2 Offshore/bounding-box definition — **rectangular box
      92°E–141°E, 15°S–21°N**, covers full Sunda Trench. See
      `docs/adr/0002-sea-bounding-box.md`.
- [x] 1.3 Multi-country GDACS events — **include the whole event**,
      out-of-scope countries mentioned too. See
      `docs/adr/0003-multi-country-events-shown-in-full.md`.

## 2. Event identity & state machine

- [x] 2.1 Cross-feed reconciliation for non-EQ hazards — **GDACS is sole
      authority**, ReliefWeb attached only as a loosely-matched
      Supplementary link, never merged. See
      `docs/adr/0004-non-eq-hazards-gdacs-sole-authority.md`.
- [x] 2.2 State machine transitions defined; **confirmed is EQ-only**. See
      `docs/adr/0005-story-state-machine.md`.
- [x] 2.3 Correction/retraction policy — **explicit "Since yesterday"
      section**, deletions get one final mention. See
      `docs/adr/0006-explicit-correction-policy.md`.

## 3. Severity triage

- [x] 3.1 GDACS alert colour vs USGS PAGER — **show both, triage on the
      higher**. See `docs/adr/0007-triage-severity-shows-both-takes-max.md`.
- [x] 3.2 Green-level noise suppression — **suppress Green triage
      severity, never suppress an escalation**. See
      `docs/adr/0008-green-tier-suppression.md`.
- [x] 3.3 Role of ReliefWeb confirmation — **purely additive**, never
      changes severity or suppression. See
      `docs/adr/0009-confirmation-is-purely-additive.md`.

## 4. Feed operations

- [x] 4.1 Polling frequency — **GDACS every 10 min (delta via
      `datemodified`), USGS every 5 min (`If-Modified-Since`), ReliefWeb
      hourly**. Recorded with the loop-shape ADR once 4.2 is settled.
- [x] 4.2 Loop shape — **scheduled short-lived ticks (5 min cadence,
      feed-specific skip logic) + one 08:30 publish run**, not a daemon.
      See `docs/adr/0010-scheduled-ticks-not-long-running-daemon.md`.
- [x] 4.3 Catch-up strategy — **per-feed cursor, advances only on
      success**. See
      `docs/adr/0011-per-feed-cursor-advances-only-on-success.md`.

## 5. Storage / persistence

- [x] 5.1 Storage mechanism — **single atomically-written JSON file**
      (`state.json`), not a database. See
      `docs/adr/0012-json-file-persistence.md`.

## 6. ReliefWeb build strategy

- [x] 6.1 Build strategy — **RSS-with-UA test first, adapter interface,
      fixtures for dev only, honest unavailability in production**. See
      `docs/adr/0013-reliefweb-adapter-and-fixture-fallback.md`.

## 7. Dashboard / report content

- [x] 7.1 Layout — **header → feed health strip → since-yesterday →
      current stories by hazard, severity-sorted**. See
      `docs/adr/0014-sitrep-layout.md`.
- [x] 7.2 ReliefWeb text policy — **zero direct quotes**, own-words
      summary + attribution + link only. See
      `docs/adr/0015-zero-reliefweb-quotes.md`.
- [x] 7.3 Between-report events — **scheduled-only publishing**, no
      out-of-band alerts in v1. See
      `docs/adr/0016-scheduled-only-publishing.md`.
- [x] 7.4 "Elsewhere in the world" footnote — **omitted entirely**,
      consistent with the hard scope line in
      `docs/adr/0001-sea-country-list.md`. No new ADR needed.
- [x] 7.5 Cadence honesty — **static disclosure line in the Feed health
      strip**, not per-story freshness tracking. See
      `docs/adr/0017-static-cadence-disclosure.md`.

---

## Answered

(moved here from above as we resolve them, with a one-line summary of the
decision — full rationale lives in CONTEXT.md / docs/adr/*.md)

## A2 — Inconsistency check (2026-07-08)

Reviewed `CONTEXT.md` + `docs/adr/*.md` together. Found and fixed:

- [x] SEA bounding box's northern bound (21°N) clipped part of in-scope
      Myanmar and would have silently broken the GDACS↔USGS EQ join for a
      northern-Myanmar earthquake. Extended to 29°N.
      `docs/adr/0002-sea-bounding-box.md`.
- [x] "Triage severity" was defined EQ-only (GDACS+PAGER max), but
      Green-tier suppression (ADR-0008) applied it to all hazards.
      Broadened the definition: for non-EQ stories, triage severity is the
      GDACS alert colour alone. `docs/adr/0007-...`, `CONTEXT.md`.
- [x] "In-scope event" term violated the glossary's own "avoid 'event'"
      rule (Story entry says use "story"/"record"). Renamed to
      "In-scope story". `CONTEXT.md`.
- [x] "Since yesterday section" enumerated 4 of the 5 non-"new" Story
      states, omitting "confirmed". Added it — a confirmation is
      mentioned even though it doesn't change severity/suppression.
      `CONTEXT.md`.
