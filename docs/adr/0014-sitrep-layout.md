# Sitrep layout: feed health first, then changes, then current stories

The sitrep needs to surface a lot: feed reliability, what changed since
the last report, and the current picture — without burying the most
trust-critical information.

We chose a fixed top-to-bottom order: header (time, scope) → Feed health
strip → Since yesterday section (ADR-0006) → current stories grouped by
hazard type, each sorted by triage severity (ADR-0007) descending within
its group.

Feed health leads because the project's core reliability principle is
"silence must mean nothing new, never that it crashed" (REQS.md) — a
reader should never have to infer a degraded morning from what's absent
from the report; it must be stated. Changes-since-yesterday come before
the full current picture because that mirrors how a human briefing works:
what changed first, then the complete state, rather than forcing the
reader to diff yesterday's report against today's themselves.
