# USGS Earthquakes

United States Geological Survey real-time earthquake feed. GeoJSON, regenerated
every minute, served as rolling windows.

## Endpoint

Verified 6 Jul 2026:

    https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson

Other windows and magnitude cut-offs exist (`all_hour`, `4.5_week`,
`significant_month`, …) — same shape throughout.

## Example response (truncated)

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "generated": 1783342886000,
    "title": "USGS All Earthquakes, Past Day",
    "count": 208
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "mag": 3.04,
        "place": "9 km NNE of Avalon, CA",
        "time": 1783342082180,
        "updated": 1783342799040,
        "felt": 1,
        "alert": null,
        "status": "automatic",
        "tsunami": 0,
        "sig": 143,
        "ids": ",ci41287863,us6000tafd,",
        "type": "earthquake",
        "title": "M 3.0 - 9 km NNE of Avalon, CA"
      },
      "geometry": { "type": "Point", "coordinates": [-118.3, 33.4, 12.1] },
      "id": "ci41287863"
    }
  ]
}
```

## Gotchas

- A single earthquake carries one `id` but several entries in `ids`. The EQ
  join matches GDACS `sourceid` against the USGS `ids` *list*, not the single
  preferred `id` — see [CONTEXT.md](../CONTEXT.md)'s **Story** definition.
- `status: automatic` events get revised (magnitude, location) and are
  occasionally deleted outright (deletions return HTTP 409, not 404). Revision
  and deletion are tracked by the Story state machine
  ([ADR-0005](../docs/adr/0005-story-state-machine.md)); the correction policy
  for an already-published report is [ADR-0006](../docs/adr/0006-explicit-correction-policy.md).
- `alert` is the USGS PAGER tier (green/yellow/orange/red) and is often
  `null`. How it combines with GDACS's colours to derive triage severity is
  [ADR-0007](../docs/adr/0007-triage-severity-shows-both-takes-max.md).
