# Corrections and deletions are stated explicitly, never silent

Feed records revise and delete underneath already-published stories
(ADR-0005). We chose to never silently update or drop a previously
reported story: every sitrep carries a "Since yesterday" section listing
state transitions for prior stories, and a deleted story gets one final
explicit mention on the sitrep immediately after its deletion is observed,
before being omitted from later reports.

The project's core reliability principle is "silence must mean nothing
new, never that it crashed" (REQS.md). Silently correcting or dropping a
story without saying so is the same trust failure in retrospect: a
decision-maker who acted on yesterday's Orange-alert typhoon needs to be
told today it de-escalated to Green, not have it vanish unexplained. This
requires persisting the last-published story snapshot to diff against,
which the state machine (ADR-0005) already needs to persist per story.
