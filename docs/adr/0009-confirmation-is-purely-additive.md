# ReliefWeb confirmation never affects severity or suppression

When a ReliefWeb page appears for an EQ story, it flips the story to the
"confirmed" state (ADR-0005). We chose to make confirmation purely
additive — it attaches the ReliefWeb link and the state label only. It
never changes triage severity (ADR-0007) and never un-suppresses a
Green-suppressed story (ADR-0008).

ReliefWeb pages are rare and lag badly (`blindspots.md`: ~90-115/year
worldwide, days-later, no weekend editorial coverage) — by the time one
appears, GDACS/PAGER severity is already the operative signal and the
event has likely already run its course one way or another. A ReliefWeb
page's existence also reflects an editorial judgment that a situation
"reached a critical point," not a magnitude/casualty measurement
comparable to an alert-colour tier, so there's no principled mapping from
"a page now exists" onto a severity change. Keeping confirmation additive
avoids a late, rare event retroactively re-triggering noise the reader
already dismissed.
