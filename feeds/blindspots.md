# Blindspots

What the three feed docs in this directory *don't* ask. Findings verified against
live endpoints and current official docs on 7 Jul 2026. Read this before writing
the PRD.

## 1. These aren't three views of the same thing

It is tempting to model this as "three feeds reporting disasters at different
speeds." They are actually three different epistemic objects:

- **USGS** is a physical measurement — but the humanitarian signal in it, the
  `alert` field, is **PAGER**: a *casualty and economic-loss forecast*
  (Green <1 fatality, Red 1,000+) that appears **20–30 minutes after** the
  origin time and can be revised afterwards.
- **GDACS alert levels are also a model forecast, not observed impact** — an
  estimate of *need for international assistance*. The EQ score is ShakeMap
  intensity multiplied by a country coping-capacity factor from the INFORM
  index (Switzerland ×0.5, South Sudan ×1.5), calibrated against historical
  casualties. GDACS's own Terms of Use say alerts "should not be used for
  decision making without prior confirmation."
- **A ReliefWeb "disaster" is an editorial decision.** OCHA's stated policy:
  *"Our goal is not to record all natural disasters that occur"* — pages are
  created when a situation "reaches a critical point," biased toward
  vulnerable countries and calls for international assistance. Only ~90–115
  disaster pages are created per year, worldwide.

The same physical earthquake therefore yields: a measurement, two disagreeing
impact *forecasts* (GDACS and PAGER use different models and genuinely
diverge), and — maybe, days later — a human judgment. "Normalising severity"
across these is not unit conversion; it is reconciling forecasts with a
verdict.

## 2. The earthquake join is already solved — and GLIDE mostly isn't the answer

For earthquakes, GDACS's `geteventdata` response carries `source: "NEIC"` and
`sourceid` — an actual USGS event ID (e.g. `us6000takd`). Match it against the
USGS `ids` *list*, not the single `id`: the preferred ID can flip to a
different network prefix over time. No fuzzy space-time matching needed for EQ.

GLIDE, the ecosystem's nominal universal key, is weaker than it looks:

- The `glide` field on GDACS events is **empty for the large majority of
  events** — populated sporadically, mostly floods and wildfires.
- On ReliefWeb it is 100% populated since 2015, but **not unique**:
  multi-country events share one GLIDE across several disaster entries.

Use GLIDE as a bonus link when present; never as the join key.

## 3. Nothing is append-only — including deletions

- USGS events can be **deleted outright**. They vanish from the summary feeds,
  and fetching the detail by eventid returns **HTTP 409 Conflict** (not 404)
  unless `includedeleted=true` is passed. This will happen and it looks like a
  server error.
- The USGS `updated` field is the version cursor, and the FDSN query API has
  `updatedafter` — the built-in catch-up mechanism after downtime.
- GDACS RSS **replaces items in place**: the `guid` (eventtype+eventid) is
  stable while episodeid, alert level, and `datemodified` mutate under it.
- Tropical-cyclone alert flapping is *by design* — levels track forecast
  uncertainty, and GDACS caps predicted Red to Orange until landfall is
  <3 days out.

Consequence: "what's new" is the wrong primitive. The agent needs "what
*changed state*" — new, escalated, de-escalated, revised, deleted — and a
policy for correcting a sitrep already published.

## 4. GDACS is six pipelines wearing one schema

- **Only EQ/tsunami/TC are fully automatic.** Floods come from a
  human-supervised JRC portal; wildfires update daily; **drought events
  publish roughly a month after onset** (10-day source-data cadence, plus a
  3-consecutive-updates rule before publication).
- `severitydata` means different things per type: magnitude for EQ, wind km/h
  for TC, a 1–3 scale for FL, hectares for WF. EQ alert scores are continuous
  0–3; TC/WF are categorical 0.5/1.5/2.5.
- Wildfires below 10,000 ha burned *and* 10,000 people within 5 km don't
  appear at all. Volcano alerting partly rides daily (not real-time)
  Smithsonian updates.

"Monitoring six hazard types" really means: real-time for two, daily for two,
monthly for one, curated for one. The PRD should say so.

## 5. The biggest humanitarian crises aren't in any of these disaster streams

GDACS covers EQ/TC/FL/VO/DR/WF — no conflict, no epidemics, no heatwaves, no
landslides. Sneakier: **ReliefWeb's `/disasters` endpoint has no conflict or
complex-emergency type either.** Sudan, Gaza, DRC — the largest humanitarian
responses on earth — exist on ReliefWeb only as *reports* (61% of which carry
no disaster-type tag at all) and country pages, never as disaster records. An
agent watching the three "disaster" streams will structurally never see them.
A legitimate scope decision for this build — but it must be an explicit line
in the PRD, not a silent property of the plumbing.

Related scope traps: the USGS `tsunami` flag **does not mean a tsunami
exists** — it's a "check NOAA" hint (tsunami warnings are NOAA/tsunami.gov's
job entirely), and USGS volcano alerting lives in a separate HANS API, not the
earthquake feeds.

## 6. Operational realities for the overnight loop

- **GDACS is the flaky one.** Practitioner-documented: the server
  intermittently returns NULL bytes instead of XML for ~10 minutes every 8–12
  hours, and some pages take 100+ seconds to respond. Graceful degradation
  gets exercised nightly, not hypothetically. Feeds regenerate every ~6
  minutes; `geteventlist/latest?datemodified=` exists for delta polling; no
  rate limits are documented.
- **USGS is the polite-infrastructure one.** 60-second cache headers, and
  `If-Modified-Since` conditional GETs genuinely return 304 — use them. No
  documented rate limit, but raw 5xx database errors were observed on
  expensive queries. FDSN queries hard-cap at 20,000 results.
- **ReliefWeb is the gated one.** Beyond the appname wait: quota is **1,000
  calls/day**, 1,000 entries/call. And a trap for the fallback plan —
  **reliefweb.int serves 403 to non-browser user agents**, so the
  "RSS needs no approval" escape hatch in `reliefweb.md` may fail from the
  agent's HTTP client even though it works in a browser. Test with the actual
  client before betting on it.
- ReliefWeb API details that waste debugging hours: filter new-since-poll on
  `date.created` (bare `date` defaults to it; `date.original` can predate it
  by decades due to archive backfill); filtering `primary_country` instead of
  `country` silently drops ~58% of relevant reports; single-item GETs return
  an *array*.
- Timestamps differ per feed: GDACS GeoJSON dates are ISO-8601 with **no
  timezone suffix** (implicitly UTC) while its RSS uses RFC-2822 GMT; USGS
  uses millisecond epochs; ReliefWeb uses ISO-8601 with explicit offset.
  Normalise to UTC before doing 08:30-SGT window arithmetic.

## 7. ReliefWeb is institutionally degrading, right now

Not in any API doc: OCHA cut ~20% of staff in 2025, ReliefWeb lost roughly
two-thirds of its team, update volume fell ~20% year-on-year, and — directly
relevant to a daily monitor — **there has been no weekend editorial coverage
since July 2025**. A disaster striking Friday night in Asia may not get a
disaster page until Monday. Treat ReliefWeb's latency and completeness as
worse than its historical reputation; don't hard-depend on its timeliness.

One counterpoint to "ReliefWeb only confirms days later": disaster pages have
an **`alert` status** that editors sometimes publish *before* impact (e.g., a
typhoon approaching the Philippines) — ReliefWeb can occasionally *lead* on
forecastable hazards while lagging badly on sudden-onset ones.

## 8. Licensing is asymmetric, and the dashboard is the exposed surface

GDACS: free with attribution (the CAP feed is explicitly CC BY 4.0). USGS:
US-government public domain. **ReliefWeb: the content belongs to ~4,000
publishers**, the site T&C forbids redistribution and derivative works, and
there is now an explicit AI clause about redistributing AI-generated content
attributed to sources. The assumed "metadata is fine, full text isn't" rule is
community convention, not a written grant. For the published report
(`dashboard-map.html`): summarise in your own words, quote sparingly,
attribute, link back — don't republish report bodies.

## 9. The feeds themselves are moving targets

ReliefWeb v1 died with a 410 this year; the appname gate is eight months old.
USGS shipped a breaking QuakeML change in April 2026 (GeoJSON unaffected) and
promises only 30 days' deprecation notice via a mailing list. GDACS's Terms of
Use explicitly warn that data formats "might change frequently and without
prior notice," and a rebuilt site at new.gdacs.org suggests a platform
migration is underway. Defensive parsing — unknown fields tolerated, schema
drift logged rather than crashed on — is the documented contract, not
paranoia.

## What the PRD must decide

1. The **event state machine** — new / escalated / revised / deleted /
   confirmed — rather than "detect new disasters".
2. Which severity signal wins when GDACS and PAGER disagree, and what
   Green-level noise gets suppressed.
3. The **scope sentence** — "natural hazards only, no conflict/epidemics" —
   stated, not implied.
4. Per-feed failure behaviour for the 08:30 report (GDACS *will* be down some
   mornings).
5. What the dashboard is allowed to show from ReliefWeb.
