# Story state machine: new/escalated/de-escalated/revised/deleted, confirmed is EQ-only

Feed records mutate in place rather than appending (GDACS rewrites items
under a stable guid, USGS revises or deletes events, ReliefWeb pages are
edited). "What's new" is therefore the wrong primitive; each story needs an
explicit state.

We defined five general states — new, escalated, de-escalated, revised,
deleted — with escalation/de-escalation split out from revision because
severity moves are the one change a sitrep must foreground, and lumping
them into a generic "revised" would bury them next to a two-decimal
magnitude correction.

We added a sixth state, confirmed, restricted to EQ stories only: it fires
when a ReliefWeb page appears for the same event via the EQ join key. It
does not exist for non-EQ stories, because ADR-0004 already decided
ReliefWeb never merges into non-EQ stories — a Supplementary link showing
up there is a story attribute, not a change of state. Making "confirmed"
universal would have required either fuzzy-matching ReliefWeb to non-EQ
stories (rejected in ADR-0004) or a hollow state that never fires for most
hazard types.
