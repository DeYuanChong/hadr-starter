# Satellite imagery from NASA GIBS, embedded at build time

Alerted (reported) stories now carry a satellite image of the affected area
so a reader can visualise regional impact. We chose NASA GIBS via the
Worldview Snapshots API — daily global VIIRS true-colour composites,
public domain, no authentication or API key, and a single bbox-centred JPEG
request per story — over Sentinel-2. Sentinel-2's free access paths were
verified live and rejected: its STAC thumbnails are per-110km-MGRS-tile
(not centred on an event — the lowest-cloud tile over a test area was
mostly ocean), and rendering centred imagery from its COGs would add a
raster-processing dependency out of proportion to a sensing-layer report.

Images are fetched by the build (one per reported story with a coordinate,
most severe first, capped at 8) and embedded as data URIs, keeping the
dashboard fully self-contained per its original zero-view-time-requests
choice — the same pattern as the embedded flags and Wikipedia summaries.
Each image links to NASA Worldview's interactive viewer for time-slider
before/after exploration; a committed before/after pair was rejected
because Southeast Asia's cloud cover routinely blanks one side (verified),
doubling page weight for a coin-flip payoff.

Honesty constraints, rendered in every caption: VIIRS is 375 m — regional
context (smoke plumes, cyclone structure, major flooding), never
building-level damage — and clouds may obscure the surface. The
acquisition date is always shown; the request date falls back one day when
GIBS hasn't finished the day's composite, and a tiny (<5 KB) response is
treated as a blank frame, not imagery. Imagery is an enhancement, never
signal: any fetch failure means the story simply renders without an image —
no fixture, because a stale or wrong satellite image is worse than none.
