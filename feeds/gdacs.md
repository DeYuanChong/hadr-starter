# GDACS

Global Disaster Alert and Coordination System (EU/UN). Multi-hazard: earthquakes,
cyclones, floods, volcanoes, drought, wildfires. Each event carries a colour-coded
alert level.

## Endpoint

GeoJSON event list (verified 6 Jul 2026):

    https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP

RSS alternative: `https://www.gdacs.org/xml/rss.xml`. Per-event detail hangs off
`url.details` inside each feature.

## Example response (truncated)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [141.845, 40.4353] },
      "properties": {
        "eventtype": "EQ",
        "eventid": 1550421,
        "episodeid": 1716583,
        "glide": "",
        "name": "Earthquake in Japan",
        "htmldescription": "Green M 4.6 Earthquake in Japan at: 06 Jul 2026 11:29:36.",
        "alertlevel": "Green",
        "alertscore": 1,
        "episodealertlevel": "Green",
        "episodealertscore": 0.0,
        "istemporary": "false",
        "iscurrent": "true",
        "country": "Japan",
        "fromdate": "2026-07-06T11:29:36",
        "todate": "2026-07-06T11:29:36",
        "datemodified": "2026-07-06T12:09:48",
        "iso3": "JPN",
        "source": "NEIC",
        "url": {
          "report": "https://www.gdacs.org/report.aspx?eventid=1550421&episodeid=1716583&eventtype=EQ",
          "details": "https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=EQ&eventid=1550421"
        }
      }
    }
  ]
}
```

## Gotchas

- Events carry `alertlevel`, `alertscore`, `episodealertlevel` and
  `episodealertscore`, and an event's colour can change after it has been
  reported. The reporting alert level and the escalation/de-escalation rules
  are defined in [ADR-0007](../docs/adr/0007-triage-severity-shows-both-takes-max.md)
  and the Story state machine in [ADR-0005](../docs/adr/0005-story-state-machine.md).
- `source: NEIC` is the same US agency behind the USGS feed, so the same
  physical earthquake can arrive from both. Cross-feed identity (the EQ join)
  is handled per [CONTEXT.md](../CONTEXT.md)'s **Story** definition; GDACS is
  the sole authority for all non-earthquake hazards
  ([ADR-0004](../docs/adr/0004-non-eq-hazards-gdacs-sole-authority.md)).
- GDACS publishes no rate limits or uptime guarantees and is known to be
  flaky. Graceful degradation and the "bad morning" reporting behaviour are
  covered in [`blindspots.md`](./blindspots.md) and
  [ADR-0010](../docs/adr/0010-scheduled-ticks-not-long-running-daemon.md).
