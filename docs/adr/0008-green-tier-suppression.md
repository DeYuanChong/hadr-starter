# Suppress Green-tier stories from the sitrep, never suppress an escalation

Green-alert earthquakes are constant background noise in a seismically
active region (Indonesia especially), and REQS.md flags picking a
noise-suppression bar as an open decision.

We chose to suppress a story from the sitrep only when its triage severity
(ADR-0007) is Green or absent, and only as a report-time filter — the
story is still tracked internally regardless. A story that later escalates
out of Green is never suppressed; the escalation is exactly what the
Since-yesterday section (ADR-0006) exists to surface.

This reuses GDACS's own alert tiering, which already bakes in a
per-country coping-capacity weighting, rather than inventing a separate
magnitude or casualty floor on top of it. It also composes cleanly with
the state machine: suppression only affects what's shown, never what's
tracked, so a suppressed story can't silently fall out of the pipeline the
way a hard filter would.
