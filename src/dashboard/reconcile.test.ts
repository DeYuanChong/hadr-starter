import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcile, type GdacsInput, type UsgsInput, type ReliefWebInput } from "./reconcile.js";

function gdacsEq(overrides: Partial<GdacsInput> = {}): GdacsInput {
  return {
    eventId: "1550657",
    name: "Earthquake in Philippines",
    hazardType: "EQ",
    country: "Philippines",
    alertLevel: "Green",
    fromDate: "2026-07-07T20:37:40",
    reportUrl: "https://www.gdacs.org/report.aspx?eventid=1550657",
    lat: 13.77,
    lon: 120.66,
    sourceId: null,
    ...overrides,
  };
}

function usgsEq(overrides: Partial<UsgsInput> = {}): UsgsInput {
  return {
    id: "us6000tase",
    ids: ["us6000tase"],
    mag: 4.5,
    place: "7 km SSE of Calatagan, Philippines",
    lat: 13.77,
    lon: 120.66,
    timeUtc: "Tue, 07 Jul 2026 20:37:40 GMT",
    alert: null,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tase",
    ...overrides,
  };
}

test("EQ join: a GDACS sourceid merges with the matching USGS event into one reconciled story", () => {
  const stories = reconcile([gdacsEq({ sourceId: "us6000tase" })], [usgsEq()], []);
  assert.equal(stories.length, 1, "the duplicate is one story, not two");
  const s = stories[0];
  assert.equal(s.reconciled, true);
  assert.equal(s.id, "us6000tase");
  assert.deepEqual(
    s.sources.map((x) => x.feed),
    ["gdacs", "usgs"],
  );
  // Both raw alerts are retained (ADR-0007): GDACS colour + PAGER (here null).
  assert.equal(s.gdacsAlert, "Green");
  assert.equal(s.pagerAlert, null);
  // USGS supplies magnitude and the precise epicentre.
  assert.equal(s.mag, 4.5);
});

test("EQ join matches against the ids LIST, not just the preferred id", () => {
  // sourceid is a non-preferred id that only appears in the ids list.
  const usgs = usgsEq({ id: "ci12345", ids: ["ci12345", "us6000tase"] });
  const stories = reconcile([gdacsEq({ sourceId: "us6000tase" })], [usgs], []);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].reconciled, true);
});

test("no join when sourceid is missing: GDACS and USGS stay two separate stories", () => {
  const stories = reconcile([gdacsEq({ sourceId: null })], [usgsEq()], []);
  assert.equal(stories.length, 2);
  assert.ok(stories.every((s) => !s.reconciled));
});

test("triage takes the higher of GDACS colour and PAGER; both are shown", () => {
  // GDACS Green + PAGER orange -> triage orange (the higher), both retained.
  const stories = reconcile(
    [gdacsEq({ sourceId: "us6000tase", alertLevel: "Green" })],
    [usgsEq({ alert: "orange" })],
    [],
  );
  assert.equal(stories[0].triageSeverity, "orange");
  assert.equal(stories[0].gdacsAlert, "Green");
  assert.equal(stories[0].pagerAlert, "orange");
  assert.equal(stories[0].suppressed, false);
});

test("Green-tier and unalerted stories are suppressed; above-Green are reported", () => {
  const green = reconcile([gdacsEq({ alertLevel: "Green" })], [], []);
  assert.equal(green[0].suppressed, true, "Green is suppressed");

  const orange = reconcile([gdacsEq({ alertLevel: "Orange" })], [], []);
  assert.equal(orange[0].suppressed, false, "Orange is reported");

  const none = reconcile([], [usgsEq({ alert: null })], []);
  assert.equal(none[0].suppressed, true, "unalerted USGS is suppressed");
});

test("multi-country GDACS event keeps all countries, in full (ADR-0003)", () => {
  const stories = reconcile(
    [gdacsEq({ hazardType: "TC", country: "Philippines, Taiwan, China", alertLevel: "Orange" })],
    [],
    [],
  );
  assert.deepEqual(stories[0].countries, ["Philippines", "Taiwan", "China"]);
});

test("ReliefWeb attaches as a supplementary link to a non-EQ story sharing a country", () => {
  const gdacs = gdacsEq({ hazardType: "FL", country: "Myanmar", alertLevel: "Orange" });
  const rw: ReliefWebInput = {
    title: "Myanmar: Floods - Jun 2026",
    countries: ["Myanmar"],
    link: "https://reliefweb.int/disaster/fl-2026-myanmar",
  };
  const stories = reconcile([gdacs], [], [rw]);
  assert.equal(stories.length, 1, "ReliefWeb is not a separate story when it has a host");
  assert.equal(stories[0].supplementary.length, 1);
  assert.equal(stories[0].supplementary[0].title, "Myanmar: Floods - Jun 2026");
});

test("a hostless ReliefWeb item is a standalone entry and is NOT alert-suppressed", () => {
  const rw: ReliefWebInput = {
    title: "Myanmar: Floods - Jun 2026",
    countries: ["Myanmar"],
    link: "https://reliefweb.int/disaster/fl-2026-myanmar",
  };
  const stories = reconcile([], [], [rw]);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].suppressed, false, "editorial ReliefWeb verdict is not Green-tier noise");
  assert.equal(stories[0].sources[0].feed, "reliefweb");
});
