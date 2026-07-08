# Overnight ingestion runs as scheduled short-lived ticks, not a daemon

The three feeds need different polling cadences (GDACS ~6 min regen, USGS
60s cache, ReliefWeb's 1,000/day quota and slow editorial pace), and the
system must run unattended overnight and still publish reliably at 08:30
SGT even through feed outages.

We chose scheduled short-lived invocations over a single long-running
process. A "poll" invocation fires every 5 minutes (the shortest per-feed
cadence): USGS every tick, GDACS every 2nd tick (~10 min), ReliefWeb every
12th tick (~hourly). Each tick fetches only the feeds due, updates
persisted story state, and exits. A separate "publish" invocation fires
once at 08:30 SGT, reads the latest persisted state, and writes
`dashboard.html`.

This matches "runs on a schedule, unattended" (README.md) rather than
implying a supervised daemon that itself needs uptime monitoring. It is
also more robust to the feeds' known failure modes: GDACS's 100+s hangs
and NULL-byte responses (`blindspots.md`) fail one tick, not the whole
night's process, and the next tick simply runs again with no watchdog
logic needed. It also forces ingest and publish apart, which the state
machine (ADR-0005) and correction policy (ADR-0006) already require
persisted state for.
