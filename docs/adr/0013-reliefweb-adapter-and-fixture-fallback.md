# ReliefWeb: adapter interface, RSS-with-UA first, fixtures for dev only

ReliefWeb's API requires a pre-approved `appname` that may not arrive
during this build, and the documented no-approval RSS fallback may 403
non-browser HTTP clients — untested as of grilling. ADR-0004/0009 already
made ReliefWeb non-blocking (supplementary link only; GDACS is sole
authority for non-EQ hazards; EQ confirmation is purely additive), so this
decision is about development strategy, not architecture load-bearing on
the core pipeline.

We chose to: test the RSS feed with a realistic browser-style `User-Agent`
first, since that's a cheap, fast test; build the ReliefWeb client behind a
small adapter interface (fetch → normalized story-link list) so the
backing source — fixture, RSS, or the approved API — is a config swap, not
a rewrite; and, if both RSS and the API are blocked, use a local fixture
file (shaped from the sample item in `reliefweb.md`) strictly for
development and demo purposes.

The live pipeline never silently substitutes fixture data for a real
source — if ReliefWeb is genuinely unreachable in production, the sitrep
reports "ReliefWeb: unavailable" honestly, per the graceful-degradation
principle (REQS.md item 5), rather than presenting fixture content as live
data. Because ReliefWeb is already non-blocking, its unavailability
degrades the report (no Supplementary links, no EQ confirmations) without
breaking it.
