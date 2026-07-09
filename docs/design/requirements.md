# Requirements — HADR Monitor for Southeast Asia (initial idea capture)

> **Archived design document.** This captures the original requirements that
> shaped the project. It is preserved for context; the authoritative design
> decisions live in [`docs/adr/`](../adr/) and the domain vocabulary in
> [`CONTEXT.md`](../../CONTEXT.md).

Raw requirements for the product planning process. Sources: the feed docs in
[`feeds/`](../../feeds/) and `feeds/blindspots.md`. This is the idea, not the
design.

## The idea

An unattended monitoring agent for humanitarian assistance and disaster
response, **focused on Southeast Asia**. It watches three public disaster
feeds — GDACS, USGS earthquakes, ReliefWeb — keeps only events affecting
Southeast Asian countries, reconciles them into single event stories, triages
severity, and publishes a morning situation report to `dashboard.html` at
08:30 Singapore time. It sits at the sensing layer only: it watches,
reconciles, and reports; it does not dispatch or decide response.

## Who it's for

A human decision-maker (or a downstream agent) in the region who needs, each
morning: *what happened in Southeast Asia, where, how bad, who is affected,
what changed since yesterday* — without reading three global feeds
themselves.

## Geographic scope

- **In:** Southeast Asian countries — the ASEAN ten (Brunei, Cambodia,
  Indonesia, Laos, Malaysia, Myanmar, Philippines, Singapore, Thailand,
  Vietnam) plus Timor-Leste. (Exact list to confirm during grilling —
  e.g. whether Papua New Guinea or southern China border events matter.)
- **Out:** everything else on the globe, even Red-level. (Maybe a one-line
  "elsewhere in the world" footnote for major events? Undecided.)
- Filtering reality differs per feed:
  - GDACS events carry `country` / `iso3` — straightforward, though
    multi-country events (one cyclone, several countries) need care.
  - ReliefWeb filters by country, but `primary_country` vs `country` matters
    (filtering `primary_country` silently drops ~58% of relevant reports).
  - USGS is global seismometer points with a `place` string — country
    filtering there means coordinates against a bounding region, not string
    matching. Offshore quakes (Sunda trench, South China Sea) that threaten
    SEA coasts must not be filtered out by a naive land-borders test.
- 08:30 SGT is the natural report time for this audience; overnight in SEA
  is the busy window.

## Why USGS stays despite the regional scope

Decided during idea capture: USGS is a *global* feed (NEIC catalog), and SEA
is the most seismically active region it covers — the Ring of Fire makes
earthquakes the region's dominant sudden-onset hazard. GDACS earthquake
events are themselves sourced from NEIC/USGS, so USGS is the upstream, and
it is the reliable one: on a GDACS-down morning it is the only quake source.
It also brings PAGER (the second, independent severity opinion), the clean
`updated`/`updatedafter` revision machinery, and FDSN bounding-box queries —
meaning the SEA filter can be done server-side instead of pulling the global
`all_day` feed.

## Core behaviours I want

1. **Watch the feeds on a schedule**, unattended, overnight. Stay quiet when
   nothing has changed — silence must mean "nothing new", never "it crashed".
2. **Track event state changes, not just new events.** The feeds revise,
   escalate, de-escalate, and outright delete events (USGS deletions return
   HTTP 409, not 404; GDACS mutates items in place under a stable guid). The
   primitive is a state machine — new / escalated / de-escalated / revised /
   deleted / confirmed — and there must be a policy for correcting a sitrep
   already published.
3. **Reconcile the same physical event across feeds** into one story instead
   of reporting it three times. Known good news: for earthquakes GDACS
   carries the USGS event ID (`source: "NEIC"` + `sourceid`); match against
   the USGS `ids` *list*, not the single preferred `id`. GLIDE is a bonus
   link only — mostly empty on GDACS, non-unique on ReliefWeb.
4. **Severity triage.** The three feeds are three different epistemic
   objects: USGS is measurement (its `alert` field is PAGER, a casualty
   *forecast* arriving 20–30 min late), GDACS alert colours are a
   needs-assistance *forecast* weighted by country coping capacity, and a
   ReliefWeb disaster page is an editorial *verdict* (days later, ~100/year
   worldwide). The report should treat them as forecast vs forecast vs
   verdict, decide which wins when GDACS and PAGER disagree, and suppress
   Green-level noise. Note GDACS's coping-capacity weighting already skews
   toward countries like Myanmar and Laos — useful for a SEA monitor.
5. **Degrade gracefully.** GDACS intermittently serves NULL bytes for ~10-min
   windows every 8–12 hours and some pages take 100+ s — a bad feed morning
   is routine, not exceptional. The 08:30 report must still publish, saying
   per-feed what it could and couldn't see.
6. **Publish the sitrep to `dashboard.html`** — the one output surface. For
   ReliefWeb content: summarise in own words, quote sparingly, attribute and
   link back; never republish report bodies (content belongs to ~4,000
   publishers; redistribution is forbidden).

## Hazard scope (must be an explicit line, not a silent property)

- **In:** natural hazards as covered by the feeds — earthquake, tsunami,
  tropical cyclone, flood, volcano, drought, wildfire. All seven are live
  concerns in SEA (Ring of Fire, typhoon belt, monsoon floods, Indonesian
  volcanoes, haze-season fires).
- **Out:** conflict, complex emergencies, epidemics, heatwaves, landslides.
  Even within SEA, major crises (e.g. Myanmar's conflict) are structurally
  absent from all three disaster streams — the product must say so, so
  absence is read as scope, not failure.
- Honesty about cadence: "multi-hazard" really means real-time for EQ/TC,
  daily for WF/VO, ~monthly for drought, human-curated for floods. Small
  wildfires (<10,000 ha) never appear at all.
- The USGS `tsunami` flag is a "check NOAA" hint, not a tsunami report;
  actual tsunami warnings are out of scope (NOAA's job) — but the flag is
  worth surfacing for offshore SEA quakes.

## Known operational constraints (verified, not assumptions)

- **USGS:** well-behaved. 60-s cache, honour `If-Modified-Since` (real 304s).
  `updated` is the version cursor; FDSN `updatedafter` is the catch-up
  mechanism after downtime, and FDSN also supports lat/lon bounding-box
  queries for the server-side SEA filter. FDSN hard-caps at 20,000 results.
  Deleted events need `includedeleted=true` (else HTTP 409).
- **GDACS:** the flaky one. Feeds regenerate ~every 6 min;
  `geteventlist/latest?datemodified=` for delta polling; no documented rate
  limits; expect nightly failures. `severitydata` means different units per
  hazard type. TC alert flapping is by design (capped Red→Orange until
  landfall <3 days).
- **ReliefWeb:** the gated one. API needs a pre-approved appname (form +
  email, may not arrive this week) and is quota'd at 1,000 calls/day. The
  "RSS needs no approval" fallback may 403 to non-browser user agents — test
  with the actual HTTP client before betting on it. Filter on `date.created`.
  Also institutionally degrading: no weekend editorial coverage since Jul
  2025 — a Friday-night disaster in Asia may get no page until Monday; never
  hard-depend on its timeliness. Its `alert`-status pages can occasionally
  *lead* on forecastable hazards (e.g. a typhoon approaching the
  Philippines) — directly useful for this region.
- **Timestamps:** GDACS GeoJSON is ISO-8601 with no TZ suffix (implicitly
  UTC), its RSS is RFC-2822 GMT, USGS is millisecond epoch, ReliefWeb is
  ISO-8601 with offset. Normalise everything to UTC before any 08:30-SGT
  window arithmetic.
- **Everything drifts:** ReliefWeb v1 died with a 410 this year, USGS broke
  QuakeML in Apr 2026 with 30 days' notice, GDACS warns formats change
  without notice and is mid-migration to new.gdacs.org. Defensive parsing —
  tolerate unknown fields, log schema drift, don't crash — is the contract.

## Deliberately open (to be settled in grilling/shaping, not here)

- The exact country list, and the offshore/bounding-box definition of
  "affects Southeast Asia" for USGS points and cyclone tracks.
- Which severity signal wins when GDACS and PAGER disagree, and the exact
  noise-suppression threshold (Green quakes are constant in Indonesia — what
  makes the cut?).
- The exact event state machine and the correction/retraction policy for
  already-published sitreps.
- Polling frequencies per feed (politeness vs freshness).
- Storage/persistence approach for event state between runs.
- Whether to build against ReliefWeb API, RSS, or fixtures while the appname
  approval is pending.
- Dashboard layout and how much ReliefWeb-derived text it may carry.
- What, if anything, goes out between 08:30 reports (e.g. a Red-level
  Philippines typhoon at 14:00 — wait until tomorrow?).
