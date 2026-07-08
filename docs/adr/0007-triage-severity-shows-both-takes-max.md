# When GDACS and PAGER disagree, show both and triage on the higher

GDACS alert colours and USGS PAGER are both impact *forecasts*, not
measurements, and use different models — `blindspots.md` documents that
they genuinely diverge. Neither is a ground truth the other should defer
to.

We chose to display both values on every EQ story rather than pick a
winner, and to derive a separate "triage severity" — the higher of the
two — used only to decide report placement and noise suppression. The
report never resolves the disagreement into a single displayed number.

Triage severity is defined for every story, not just EQ ones: non-EQ
hazards have no PAGER equivalent (ADR-0004 already made GDACS sole
authority for them), so their triage severity is simply their GDACS alert
colour alone — the trivial single-source case of the same "take the
highest available signal" rule. This keeps Green-tier suppression
(ADR-0008) well-defined across every hazard type, not just earthquakes.

Silently picking one source would hide real forecast uncertainty from a
decision-maker. Taking the max for triage purposes is a deliberately
conservative default: under-reacting to a forecast that turns out correct
is worse than over-reacting to one that turns out wrong, for a HADR
audience. It also avoids building a weighting/reconciliation model neither
the timeline nor the source data justifies.
