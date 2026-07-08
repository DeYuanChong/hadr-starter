# Map dashboard — PRD user-story coverage

The map dashboard (`src/dashboard/`, output `dashboard-map.html` +
`dashboard-map.json`)
is a **single-snapshot** situation report: it fetches all three feeds once,
reconciles, triages, and renders. That scope was chosen deliberately (the
stateful, history-dependent stories need persisted prior state, which a
snapshot build does not keep). This file records, story by story, what the
PRD's 20 user stories get from this build.

Legend: ✅ met · ◑ partial · ⏳ deferred (needs the persistence/scheduling
layer, out of scope for a snapshot dashboard).

| # | Story (abbrev.) | Status | How / why |
|---|---|---|---|
| 1 | One report for all SEA activity | ✅ | Single `dashboard-map.html` unifying GDACS + USGS + ReliefWeb. |
| 2 | Feed health up front | ✅ | Feed-health strip; each feed live/fixture/unavailable + detail. |
| 3 | Hazard-cadence disclosure | ✅ | Static cadence line under the health strip (ADR-0017). |
| 4 | Same earthquake reported once | ✅ | EQ join: GDACS `sourceid` (detail endpoint) ↔ USGS `ids` list. 4 reconciled on the verifying run. |
| 5 | Both GDACS colour + PAGER shown | ✅ | Both raw alerts rendered on the story; triage severity = the higher (ADR-0007). |
| 6 | Green-tier suppressed by default | ✅ | Stateless suppression (ADR-0008); suppressed count disclosed, markers shown faint on the map. |
| 7 | Escalation out of Green shown immediately | ⏳ | Needs prior state to know a story escalated. |
| 8 | Explicit "since yesterday" | ⏳ | Needs a persisted prior snapshot. Rendered as an honest "not tracked" note, not omitted (ADR-0006). |
| 9 | Deleted event flagged once | ⏳ | Needs prior state. |
| 10 | Multi-country event shown in full | ✅ | All affected countries kept, unclipped (ADR-0003). |
| 11 | Offshore Sunda Trench quakes included | ✅ | Bounding-box scope (ADR-0002); offshore markers visible on the map. |
| 12 | ReliefWeb confirmation of an EQ | ◑ | Supplementary attach (same country + non-EQ) is done; confirmation *as a state transition* needs prior state (⏳). |
| 13 | ReliefWeb own-words + link, not republished | ✅ | Title + link + "via ReliefWeb" attribution only; zero body text (ADR-0015). |
| 14 | Predictable 08:30 publish | ◑ | Build is a deterministic one-shot (`npm run build:dashboard`); wiring it to 08:30 SGT is a separate scheduling concern (ADR-0010). |
| 15 | High-severity event waits for next report (no out-of-band) | ✅ | By design — only the build publishes; there is no separate alert channel (ADR-0016). |
| 16 | Downstream agent gets structured data | ✅ | `dashboard-map.json` emitted alongside the HTML, same story data. |
| 17 | Per-feed failures isolated | ✅ | Each feed fetched in its own try/catch; one failing degrades only its own health line, the report still publishes. |
| 18 | Per-feed catch-up cursor | ⏳ | Needs persisted cursors between runs. |
| 19 | No hard dependency on ReliefWeb appname | ✅ | RSS-first with fixture fallback (ADR-0013); the verifying run used the fixture and said so honestly. |
| 20 | Single human-readable state file | ⏳ | No persisted state in a snapshot build. (`dashboard-map.json` is a human-readable *output*, not persisted run state.) |

**Summary:** 13 met, 2 partial, 5 deferred. Every deferred item shares one
root cause — no persistence between runs — which is itself a documented,
deliberate scope boundary for this build (see the module docs in
`src/dashboard/` and the "since yesterday" note the dashboard renders).
