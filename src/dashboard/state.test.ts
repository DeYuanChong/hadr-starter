import { test } from "node:test";
import assert from "node:assert/strict";

import { applyStateMachine, parseUtcish, type PersistedState } from "./state.js";
import type { FeedHealth } from "./render.js";
import type { Story } from "../shared/story.js";

const T0 = new Date("2026-07-07T23:30:00Z");
const T1 = new Date("2026-07-08T00:30:00Z");
/** A 30-day window start well before every fixture event time. */
const WINDOW_START = Date.parse("2026-06-08T00:00:00Z");

const ALL_LIVE: FeedHealth[] = [
  { feed: "gdacs", status: "live", detail: "" },
  { feed: "usgs", status: "live", detail: "" },
  { feed: "reliefweb", status: "live", detail: "" },
];

function story(overrides: Partial<Story> = {}): Story {
  const base: Story = {
    id: "us1",
    hazardType: "EQ",
    title: "M5 test quake",
    countries: ["Philippines"],
    lat: 13,
    lon: 122,
    timeUtc: "Mon, 06 Jul 2026 10:00:00 GMT",
    mag: 5.0,
    gdacsAlert: "Green",
    pagerAlert: null,
    triageSeverity: "green",
    suppressed: true,
    reconciled: false,
    aliases: ["us1"],
    state: "new",
    sources: [{ feed: "usgs", url: null }],
    supplementary: [],
  };
  return { ...base, ...overrides };
}

/** Builds a prior PersistedState by actually running a first pass — the same
 * path production takes, so snapshots can't drift from the real shape. */
function priorFrom(stories: Story[], health = ALL_LIVE): PersistedState {
  return applyStateMachine(null, stories, health, T0, WINDOW_START, {}).nextState;
}

test("first run: everything is new, no change lines, prior is null", () => {
  const r = applyStateMachine(null, [story()], ALL_LIVE, T0, WINDOW_START, {});
  assert.equal(r.priorRunAt, null);
  assert.equal(r.stories[0].state, "new");
  assert.equal(r.changes.length, 0, "first run announces nothing (the whole report is new)");
  assert.ok(r.nextState.stories.us1);
});

test("escalation out of Green: state escalated, change line present, story reported", () => {
  const prior = priorFrom([story()]); // green, suppressed
  const cur = story({ gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false });
  const r = applyStateMachine(prior, [cur], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r.stories[0].state, "escalated");
  assert.deepEqual(
    r.changes.map((c) => c.kind),
    ["escalated"],
  );
  assert.match(r.changes[0].detail, /green → orange/);
  assert.equal(r.stories[0].suppressed, false, "escalated story appears in the body");
});

test("de-escalation into Green of a previously reported story gets its line", () => {
  const prior = priorFrom([
    story({ gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false }),
  ]);
  const cur = story(); // back to green, suppressed again
  const r = applyStateMachine(prior, [cur], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r.stories[0].state, "de-escalated");
  assert.deepEqual(
    r.changes.map((c) => c.kind),
    ["de-escalated"],
    "the reader who saw Orange yesterday is told it came back down",
  );
});

test("suppressed-to-suppressed transitions of never-reported stories stay silent", () => {
  const prior = priorFrom([story({ triageSeverity: "none", gdacsAlert: null })]);
  const cur = story(); // none -> green: an escalation, but within suppressed tiers
  const r = applyStateMachine(prior, [cur], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r.stories[0].state, "escalated");
  assert.equal(r.changes.length, 0, "background noise moving within Green stays out of the report");
});

test("revision: material change (magnitude) on a reported story", () => {
  const prior = priorFrom([
    story({ mag: 5.0, gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false }),
  ]);
  const cur = story({ mag: 5.4, gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false });
  const r = applyStateMachine(prior, [cur], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r.stories[0].state, "revised");
  assert.match(r.changes[0].detail, /M5\.0 → M5\.4/);
});

test("confirmed: ReliefWeb page appearing on an EQ story, additive only", () => {
  const prior = priorFrom([
    story({ gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false }),
  ]);
  const cur = story({
    gdacsAlert: "Orange",
    triageSeverity: "orange",
    suppressed: false,
    supplementary: [{ title: "PHL EQ page", url: "https://reliefweb.int/disaster/eq-x" }],
  });
  const r = applyStateMachine(prior, [cur], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r.stories[0].state, "confirmed");
  assert.equal(r.stories[0].triageSeverity, "orange", "confirmation never changes severity (ADR-0009)");
  assert.deepEqual(r.changes.map((c) => c.kind), ["confirmed"]);
});

test("deleted: reported story gone while its feed is live — one mention, then purged", () => {
  const prior = priorFrom([
    story({ gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false }),
  ]);
  // Run with the story absent.
  const r1 = applyStateMachine(prior, [], ALL_LIVE, T1, WINDOW_START, {});
  assert.deepEqual(r1.changes.map((c) => c.kind), ["deleted"]);
  assert.equal(r1.nextState.stories.us1.state, "deleted", "snapshot survives for the purge");

  // Next run: the deleted snapshot is purged, no second mention.
  const r2 = applyStateMachine(r1.nextState, [], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r2.changes.length, 0, "deletion is mentioned exactly once (ADR-0006)");
  assert.equal(r2.nextState.stories.us1, undefined);
});

test("a story absent while its feed is DOWN is carried forward, never deleted", () => {
  const prior = priorFrom([
    story({ gdacsAlert: "Orange", triageSeverity: "orange", suppressed: false }),
  ]);
  const usgsDown: FeedHealth[] = [
    { feed: "gdacs", status: "live", detail: "" },
    { feed: "usgs", status: "unavailable", detail: "outage" },
    { feed: "reliefweb", status: "live", detail: "" },
  ];
  const r = applyStateMachine(prior, [], usgsDown, T1, WINDOW_START, {});
  assert.equal(r.changes.length, 0, "an outage is never read as a deletion");
  assert.ok(r.nextState.stories.us1, "story carried forward for the next healthy run");
  assert.notEqual(r.nextState.stories.us1.state, "deleted");
});

test("USGS-only story older than the query window ages out silently", () => {
  const prior = priorFrom([
    story({
      timeUtc: "Mon, 01 Jun 2026 10:00:00 GMT", // before WINDOW_START
      gdacsAlert: "Orange",
      triageSeverity: "orange",
      suppressed: false,
    }),
  ]);
  const r = applyStateMachine(prior, [], ALL_LIVE, T1, WINDOW_START, {});
  assert.equal(r.changes.length, 0, "aging out of the window we asked for is not a deletion");
  assert.equal(r.nextState.stories.us1, undefined, "dropped from state without a mention");
});

test("alias overlap keeps identity when the preferred id changes (late EQ join)", () => {
  // Yesterday: GDACS-only story under its eventid.
  const prior = priorFrom([
    story({
      id: "gd123",
      aliases: ["gd123"],
      sources: [{ feed: "gdacs", url: null }],
      gdacsAlert: "Orange",
      triageSeverity: "orange",
      suppressed: false,
    }),
  ]);
  // Today: the join resolved — same story, new preferred id, alias overlap.
  const cur = story({
    id: "us999",
    aliases: ["us999", "gd123"],
    reconciled: true,
    sources: [
      { feed: "gdacs", url: null },
      { feed: "usgs", url: null },
    ],
    gdacsAlert: "Orange",
    triageSeverity: "orange",
    suppressed: false,
  });
  const r = applyStateMachine(prior, [cur], ALL_LIVE, T1, WINDOW_START, {});
  assert.notEqual(r.stories[0].state, "new", "same physical event, not a new story");
  assert.equal(
    r.changes.filter((c) => c.kind === "deleted").length,
    0,
    "and the old id is not reported deleted",
  );
});

test("cursors advance only for feeds that succeeded (ADR-0011)", () => {
  const prior = priorFrom([story()]); // all cursors set at T0
  const usgsDown: FeedHealth[] = [
    { feed: "gdacs", status: "live", detail: "" },
    { feed: "usgs", status: "unavailable", detail: "outage" },
    { feed: "reliefweb", status: "fixture", detail: "fallback" },
  ];
  const r = applyStateMachine(prior, [story()], usgsDown, T1, WINDOW_START, {
    gdacs: "2026-07-08T00:29:00",
  });
  assert.equal(r.nextState.cursors.gdacs.lastSuccessAt, T1.toISOString(), "live feed advances");
  assert.equal(r.nextState.cursors.gdacs.watermark, "2026-07-08T00:29:00");
  assert.equal(
    r.nextState.cursors.usgs.lastSuccessAt,
    T0.toISOString(),
    "failed feed keeps its prior cursor unmoved",
  );
  assert.equal(
    r.nextState.cursors.reliefweb.lastSuccessAt,
    T0.toISOString(),
    "fixture is not a live success either",
  );
});

test("new reported story on a non-first run gets a 'new' line; suppressed ones don't", () => {
  const prior = priorFrom([story()]);
  const reported = story({
    id: "us2",
    aliases: ["us2"],
    gdacsAlert: "Orange",
    triageSeverity: "orange",
    suppressed: false,
  });
  const suppressed = story({ id: "us3", aliases: ["us3"] });
  const r = applyStateMachine(prior, [story(), reported, suppressed], ALL_LIVE, T1, WINDOW_START, {});
  assert.deepEqual(
    r.changes.map((c) => [c.kind, c.storyId]),
    [["new", "us2"]],
    "only the reportable arrival is announced",
  );
});

test("a new non-EQ Green story surfaces as 'new' (ADR-0008 scoped to EQ)", () => {
  // A Green-alert flood is not background seismicity, so it is reported and
  // therefore announced on a non-first run — unlike a suppressed Green EQ.
  const prior = priorFrom([story()]); // an existing suppressed Green EQ
  const flood: Story = {
    ...story(),
    id: "fl1",
    aliases: ["fl1"],
    hazardType: "FL",
    title: "Flood in Laos",
    countries: ["Laos"],
    gdacsAlert: "Green",
    pagerAlert: null,
    triageSeverity: "green",
    suppressed: false, // triage.ts would set this; state machine trusts the flag
    sources: [{ feed: "gdacs", url: null }],
  };
  const r = applyStateMachine(prior, [story(), flood], ALL_LIVE, T1, WINDOW_START, {});
  assert.deepEqual(
    r.changes.map((c) => [c.kind, c.storyId]),
    [["new", "fl1"]],
    "the Green non-EQ arrival is announced, not swallowed as noise",
  );
});

test("parseUtcish treats GDACS's bare timestamps as UTC, not local time", () => {
  const bare = parseUtcish("2026-07-06T11:29:36"); // GDACS shape, no suffix
  const explicit = parseUtcish("2026-07-06T11:29:36Z");
  assert.equal(bare, explicit);
  assert.equal(parseUtcish("Tue, 07 Jul 2026 20:37:40 GMT"), Date.parse("2026-07-07T20:37:40Z"));
  assert.equal(parseUtcish(null), null);
  assert.equal(parseUtcish("not a date"), null);
});
