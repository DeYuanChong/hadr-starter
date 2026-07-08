# HADR Monitor

An unattended monitoring agent for humanitarian assistance and disaster
response, focused on Southeast Asia. It watches GDACS, USGS, and ReliefWeb,
reconciles events across feeds, triages severity, and publishes a daily
situation report. It sits at the sensing layer only — it does not dispatch
or decide response.

## Language

**Southeast Asia (SEA)**:
The eleven countries: the ASEAN ten (Brunei, Cambodia, Indonesia, Laos,
Malaysia, Myanmar, Philippines, Singapore, Thailand, Vietnam) plus
Timor-Leste. Papua New Guinea and southern China are explicitly excluded,
even though both border in-scope countries — geographic proximity alone
does not confer in-scope status.
_Avoid_: "the region" (ambiguous), "ASEAN" (excludes Timor-Leste).

**Story**:
The reconciled representation of one physical disaster, built from one or
more feed records. For earthquakes, a story may merge GDACS, USGS, and
ReliefWeb records via the solved EQ join (GDACS `sourceid` ↔ USGS `ids`).
For all other hazard types, a story is sourced solely from GDACS; a
ReliefWeb page is never merged into it, only attached as a Supplementary
link.
_Avoid_: "event" alone when a specific feed's record is meant — use "story"
for the reconciled view, "record" for a single feed's raw item.

**Supplementary link**:
A loosely-matched ReliefWeb page (same country, same hazard type, `date.
created` within ~14 days of the GDACS story's `fromdate`) attached to a
non-EQ story for extra editorial context. It does not affect the story's
severity, status, or content — it is shown as a "related coverage" pointer,
never merged.

**Story state**:
Every story is in exactly one state, updated each poll:
- **new** — first time the story's record(s) are seen.
- **escalated** / **de-escalated** — the severity signal (GDACS
  `alertlevel` or USGS PAGER `alert`) moved up/down a tier since the last
  poll. Called out separately from "revised" because it's the change a
  sitrep must foreground.
- **revised** — any other material change (location, magnitude, affected
  countries, `datemodified`/`updated` bump) that isn't a severity move.
- **deleted** — the source feed no longer returns the record as current.
- **confirmed** — EQ stories only: a ReliefWeb page now exists for the
  same event via the EQ join. Non-EQ stories never reach this state — see
  Supplementary link, which is an attribute, not a state transition.
  Confirmation is purely additive: it attaches the ReliefWeb link and the
  state label only, and never changes triage severity or un-suppresses an
  already-Suppressed story.
_Avoid_: "status" as a synonym for a feed's own field (e.g. USGS `status:
automatic`) — that's a feed-record property, not a Story state.

**Own-words summary**:
The only form ReliefWeb content may take in the sitrep: a one-sentence,
non-quoted paraphrase of a page's title/description, plus attribution
("via ReliefWeb") and a link back. Zero direct quotes — never a copied
sentence or phrase from the source page.

**Feed health strip**:
The sitrep's leading section: one line per feed (GDACS/USGS/ReliefWeb)
stating whether it was reachable, degraded, or unavailable, and when it
was last successfully polled. States a bad morning up front rather than
leaving it to be inferred from missing stories. Also carries a static
cadence-disclosure line for GDACS's per-hazard update frequency
(real-time for EQ/TC, daily for WF/VO, ~monthly for drought, human-curated
for flood), so an absent hazard reads as "not due," not "no risk."

**Since yesterday section**:
A part of the sitrep that explicitly lists state transitions for stories
reported in a prior sitrep — escalation, de-escalation, revision,
confirmation, or deletion — rather than silently updating or dropping
them. A confirmed transition is mentioned here even though it doesn't
change severity or suppression (see Story state); a deleted story is
mentioned here exactly once, on the sitrep immediately after its deletion
is observed, then omitted from all later reports.

**Triage severity**:
The value used to decide a story's report placement and noise suppression
(see Suppressed). For EQ stories carrying both a GDACS alert colour and a
USGS PAGER alert, it's the higher (more severe) of the two tiers — both
values are still shown to the reader; triage severity never hides that the
two forecasts disagreed, it only decides ordering and inclusion. For every
other hazard type, there is no PAGER equivalent (GDACS is sole authority
per the Story definition), so triage severity is simply the GDACS alert
colour alone — the single-source case of the same rule.
_Avoid_: "severity" alone when a specific source's value is meant — say
"GDACS alert colour" or "PAGER alert" for the raw values, "triage
severity" only for the derived value used in decisions.

**Suppressed**:
A story with Green-tier triage severity (or no alert at all) is tracked
internally but omitted from the sitrep. Suppression is a report-time
filter only, not a change to Story state — a suppressed story is still
tracked, and an escalation out of Green is never suppressed, surfacing
immediately via the Since yesterday section or as a fresh entry.

**In-scope story**:
A story with at least one affected location — a GDACS `country`/`iso3`,
a USGS epicentre inside the SEA bounding box, or a ReliefWeb `country` —
within Southeast Asia (see above). The story is reported in full, including
any out-of-scope countries it also affects; scope decides *whether* a
story is reported, not what parts of it are shown.
