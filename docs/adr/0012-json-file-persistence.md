# Persist state to a single atomically-written JSON file, not a database

The pipeline needs to persist per-story state (state machine + last-
published snapshot) and a per-feed catch-up cursor (ADR-0011) between
scheduled ticks (ADR-0010).

We chose a single flat JSON file (`state.json`), holding a `cursors` object
keyed by feed and a `stories` object keyed by story ID, written atomically
(temp file + rename) after each successful tick. We rejected a database
(e.g. SQLite).

A SEA-filtered nightly slice of three feeds is at most dozens of stories —
far below where a database's query/indexing power pays for its setup and
schema-migration cost, which a 3-day build can't afford to spend on. Ticks
run one at a time on a schedule, so there is no concurrent-writer problem
requiring transactional guarantees; atomic write is enough crash-safety
given ticks are already designed to fail and retry cleanly. A flat file is
also trivially inspectable by opening it directly, which matters when
debugging an overnight run the next morning.
