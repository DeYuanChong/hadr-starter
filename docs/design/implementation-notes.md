# Implementation notes

A running log of implementation decisions, open questions, and deliberate
deviations from the PRD or the ADRs. One entry per working block.

## Decisions

## Open questions

## Deviations

- Green-tier suppression (ADR-0008) is scoped to **earthquakes only**.
  ADR-0008's decision text applies the rule to all hazards ("a story whose
  triage severity is Green or absent"), but the ADR's own motivation
  paragraph names earthquakes specifically ("Green-alert earthquakes are
  constant background noise"), and the PRD user story (docs/design/prd.html)
  says "Green-tier earthquakes suppressed from the report." Green-alert
  non-EQ hazards (floods, cyclones, volcanoes, …) are not background
  seismicity — a Green-alert flood is a real, if minor, signal — so they
  are now reported. `assignTriage` takes `hazardType` and suppresses only
  when `hazardType === "EQ"` and tier ≤ green. The committed
  `dashboard-map.html`/`.json` were patched in place to flip the Laos
  Green flood to reported; the next scheduled sitrep rebuild reproduces
  this from `render.ts`. Reason: Green-alert floods are not background
  noise; the PRD user story was always EQ-scoped.

<!-- Anything built that departs from the PRD or CLAUDE.md is recorded here,
     with the reason. An undocumented deviation is a bug. -->
