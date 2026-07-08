# GDACS is the sole authority for non-earthquake hazards in v1

Earthquake reconciliation across GDACS, USGS, and ReliefWeb is solved via a
strong join key (GDACS `sourceid` = a USGS event id). No equivalent key
exists for the other five GDACS hazard types (cyclone, flood, volcano,
drought, wildfire): USGS doesn't cover them, and GLIDE — the only shared
identifier — is empty on most GDACS events and non-unique on ReliefWeb.

We chose not to attempt GDACS↔ReliefWeb reconciliation for non-EQ hazards
in v1. GDACS is treated as the sole authoritative source for these stories.
A ReliefWeb page may be opportunistically attached as a Supplementary link
(loose match: same country, same hazard type, `date.created` within ~14
days of the GDACS story's start) but is never merged into the story or
allowed to affect its severity or status.

Building reliable fuzzy space-time-type matching was judged out of scope
for a 3-day build, and a false merge (two different disasters shown as one)
is worse for a decision-maker than two disasters correctly shown as two. As
a secondary factor, ReliefWeb's own institutional lag (no weekend
editorial coverage, only ~90-115 disaster pages published per year
worldwide) means most non-EQ SEA events won't have a ReliefWeb page to
reconcile against during this build anyway.
