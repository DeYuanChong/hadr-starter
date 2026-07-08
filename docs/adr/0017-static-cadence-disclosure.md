# Static hazard-cadence disclosure, not per-story freshness tracking

`blindspots.md` warns that "multi-hazard" coverage from GDACS doesn't mean
uniform freshness: real-time for earthquake/cyclone, daily for
wildfire/volcano, ~monthly for drought, human-curated for flood. Without
disclosure, an absent drought story could be misread as "no drought risk"
rather than "not due for an update," and the PRD is explicitly required to
address this honestly.

We chose a static cadence-disclosure line in the Feed health strip
(ADR-0014) — a fixed sentence stating each hazard type's typical GDACS
update cadence — over computing and displaying per-hazard or per-story
freshness metadata.

A static line is always true regardless of what's currently reported, so
it can't go stale or wrong the way a dynamically computed "last updated
for this hazard type" value could if the underlying tracking had a bug.
It is also far cheaper to build in the time available than per-hazard
freshness tracking. It lives alongside feed reachability status because
both answer the same question for the reader: what can this data source
actually tell me right now?
