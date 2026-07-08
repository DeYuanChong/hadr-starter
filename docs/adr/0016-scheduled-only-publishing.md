# No out-of-band alerts — publishing only happens at the scheduled 08:30 run

REQS.md left open what happens when a high-severity event lands between
sitreps (e.g. a Red-level typhoon at 14:00): wait for tomorrow, or alert
immediately.

We chose scheduled-only publishing for v1: `dashboard.html` is written
only by the 08:30 SGT publish run (ADR-0010). No separate real-time or
interrupt-driven alert channel exists. Ingestion ticks keep running on
their normal cadence regardless of severity, so a high-severity event is
already captured in persisted story state by the time the next publish
run happens — it is delayed, not lost.

REQS.md and README.md both describe `dashboard.html` as "the one output
surface." An interrupt-driven alert channel is a materially different
product — real-time alerting rather than a daily situation report — and
is out of scope for a 3-day build. Keeping one publish trigger (the clock)
and one output path is also far easier to get right and test in the time
available. This is a "not yet," not a "never": interrupt-driven publishing
for Red-level events is a reasonable v2 addition.
