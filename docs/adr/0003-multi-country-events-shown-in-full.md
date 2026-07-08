# Multi-country events are reported in full, not clipped to SEA countries

A GDACS event (typically a tropical cyclone) can list several affected
countries, only some of which are in Southeast Asia. We chose to report
such events in full — including their out-of-scope affected countries —
rather than stripping the event down to only its SEA-country slice.

GDACS doesn't expose a clean way to split severity, alert level, or the
event record itself by country; those attributes describe the whole storm.
Clipping the country list would fabricate a narrower view of the event's
actual physical footprint than what happened, and for a humanitarian
audience, knowing a storm also struck a neighbouring non-SEA country is
useful context, not noise. Scope (Southeast Asia) decides *whether* an
event is included in the report, not what parts of an included event are
shown.
