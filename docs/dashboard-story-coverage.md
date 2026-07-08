# Map dashboard — PRD user-story coverage

The map dashboard (`src/dashboard/`, output `dashboard-map.html` +
`dashboard-map.json`) is a **stateful** situation-report pipeline: each run
fetches all three feeds, reconciles, triages, diffs against the previous
run's persisted state (`state.json`, docs/adr/0012), and renders. This file
records, story by story, what the PRD's 20 user stories get from this build.

Legend: ✅ met · ◑ partial.

| # | Story (abbrev.) | Status | How / why |
|---|---|---|---|
| 1 | One report for all SEA activity | ✅ | Single `dashboard-map.html` unifying GDACS + USGS + ReliefWeb. |
| 2 | Feed health up front | ✅ | Feed-health strip; each feed live/fixture/unavailable + detail. |
| 3 | Hazard-cadence disclosure | ✅ | Static cadence line under the health strip (ADR-0017). |
| 4 | Same earthquake reported once | ✅ | EQ join: GDACS `sourceid` (detail endpoint) ↔ USGS `ids` list. 4 reconciled on the verifying run. |
| 5 | Both GDACS colour + PAGER shown | ✅ | Both raw alerts rendered on the story; triage severity = the higher (ADR-0007). |
| 6 | Green-tier suppressed by default | ✅ | Tier-based suppression (ADR-0008); suppressed count disclosed, markers shown faint on the map. |
| 7 | Escalation out of Green shown immediately | ✅ | State machine (ADR-0005) detects tier moves against prior state; an escalation out of Green lands above Green, so tier-based suppression can never hide it, and it gets a Since-yesterday line + an `escalated` badge. |
| 8 | Explicit "since yesterday" | ✅ | Real diff against `state.json`: escalations, de-escalations, revisions, confirmations, deletions, and reportable new arrivals — with an honest "first run" note when no prior state exists and an explicit "nothing changed" line otherwise (ADR-0006). |
| 9 | Deleted event flagged once | ✅ | A previously-reported story gone while its source feeds are live is mentioned exactly once as deleted, then purged (ADR-0005/0006). Absence during an outage is carried forward, never read as deletion; USGS events aging out of the query window drop silently (we stopped asking, the source didn't delete). |
| 10 | Multi-country event shown in full | ✅ | All affected countries kept, unclipped (ADR-0003). |
| 11 | Offshore Sunda Trench quakes included | ✅ | Bounding-box scope (ADR-0002); offshore markers visible on the map. |
| 12 | ReliefWeb confirmation of an EQ | ✅ | A ReliefWeb page attaches to an EQ story only on an exact GLIDE match (conservative by design — GLIDE is a bonus link, mostly empty on GDACS, so this fires rarely); the attach flips the story to `confirmed`, additive-only per ADR-0009. Non-EQ country-match attach unchanged (ADR-0004). |
| 13 | ReliefWeb own-words + link, not republished | ✅ | Title + link + "via ReliefWeb" attribution only; zero body text (ADR-0015). |
| 14 | Predictable 08:30 publish | ◑ | Build is a deterministic one-shot (`npm run build:dashboard`) with persisted state between runs; wiring it to a 08:30 SGT schedule is the remaining piece (ADR-0010/0016). |
| 15 | High-severity event waits for next report (no out-of-band) | ✅ | By design — only the build publishes; there is no separate alert channel (ADR-0016). |
| 16 | Downstream agent gets structured data | ✅ | `dashboard-map.json` emitted alongside the HTML — stories with state + aliases, feed health, and the sinceYesterday change list. |
| 17 | Per-feed failures isolated | ✅ | Each feed fetched in its own try/catch; one failing degrades only its own health line, the report still publishes — and its stories are carried forward, not deleted. |
| 18 | Per-feed catch-up cursor | ✅ | `state.json` holds a per-feed cursor advanced only on success (ADR-0011); the USGS query window extends back to the last successful poll when it predates the default lookback, and per-feed version watermarks (GDACS max `datemodified`, USGS max `updated`) are recorded for future delta polling. ReliefWeb's cursor is honestly still null — it has never had a live success (fixture runs don't count). |
| 19 | No hard dependency on ReliefWeb appname | ✅ | RSS-first with fixture fallback (ADR-0013); the verifying run used the fixture and said so honestly. |
| 20 | Single human-readable state file | ✅ | `state.json` at the repo root: cursors + story snapshots, pretty-printed JSON, written atomically (temp file + rename, ADR-0012). A corrupt/missing file degrades to "first run" rather than blocking the publish. |

**Summary:** 19 met, 1 partial. The remaining partial (story 14) is purely a
scheduling concern — running `npm run build:dashboard` at 08:30 SGT — not a
missing capability in the pipeline itself.
