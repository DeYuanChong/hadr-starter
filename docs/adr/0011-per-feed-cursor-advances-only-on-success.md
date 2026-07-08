# Per-feed catch-up cursor, advanced only on success

Poll ticks (ADR-0010) can be missed or fail outright (GDACS's documented
NULL-byte windows and 100+s hangs, transient 5xx). Resuming from "now" on
the next tick would silently lose whatever changed during the gap.

We chose to persist one cursor per feed — GDACS `datemodified`, USGS
`updatedafter` (FDSN), ReliefWeb `date.created` — and always query
since-cursor, never since-scheduled-time. The cursor only advances after a
tick succeeds; a failed tick (timeout, NULL bytes, 5xx) leaves it
unmoved, so the next successful tick still catches everything that
changed during the outage.

This uses each feed's own documented catch-up mechanism as intended —
`blindspots.md` calls USGS's `updated`/`updatedafter` pair exactly this:
"the built-in catch-up mechanism after downtime." It turns the tick
cadence (ADR-0010) into a target rather than a guarantee: however long a
feed is unreachable, no escalation is silently lost once it recovers. The
cursor is stored alongside the existing per-story persisted state, not as
separate infrastructure.
