import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildQueryUrl,
  extractInScopeEvents,
  renderEventsPage,
  type UsgsFeature,
  type UsgsFeatureCollection,
} from "./index.js";
import { SEA_BOUNDING_BOX } from "../../shared/sea-scope.js";

// Fixture shaped from the real example response in feeds/usgs.md — this
// exact event (Avalon, CA) is outside the SEA bounding box and is the
// "point outside scope must be filtered" case. It also exercises a null
// PAGER alert, which must be handled without crashing.
const avalonCaOutsideScope: UsgsFeature = {
  type: "Feature",
  properties: {
    mag: 3.04,
    place: "9 km NNE of Avalon, CA",
    time: 1783342082180,
    updated: 1783342799040,
    felt: 1,
    alert: null,
    status: "automatic",
    tsunami: 0,
    sig: 143,
    ids: ",ci41287863,us6000tafd,",
    type: "earthquake",
    title: "M 3.0 - 9 km NNE of Avalon, CA",
  },
  geometry: { type: "Point", coordinates: [-118.3, 33.4, 12.1] },
  id: "ci41287863",
};

// A fixture point clearly inside the SEA bounding box (offshore Java,
// Indonesia), with a non-null PAGER alert and a source url, per the fields
// the FDSN response actually carries.
const javaSeaInsideScope: UsgsFeature = {
  type: "Feature",
  properties: {
    mag: 5.8,
    place: "112 km SSE of Tuban, Indonesia",
    time: 1783345682180, // later than the Avalon fixture -> should sort first
    updated: 1783346000000,
    alert: "green",
    status: "reviewed",
    tsunami: 0,
    sig: 480,
    ids: ",us7000abcd,",
    type: "earthquake",
    title: "M 5.8 - 112 km SSE of Tuban, Indonesia",
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
  },
  geometry: { type: "Point", coordinates: [112.1, -7.3, 35.2] },
  id: "us7000abcd",
};

function collectionOf(...features: UsgsFeature[]): UsgsFeatureCollection {
  return {
    type: "FeatureCollection",
    metadata: { generated: Date.now(), title: "test fixture", count: features.length },
    features,
  };
}

test("extractInScopeEvents keeps a point inside the SEA bounding box", () => {
  const events = extractInScopeEvents(collectionOf(javaSeaInsideScope));
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "us7000abcd");
  assert.equal(events[0].place, "112 km SSE of Tuban, Indonesia");
  assert.equal(events[0].lat, -7.3);
  assert.equal(events[0].lon, 112.1);
});

test("extractInScopeEvents filters out a point outside the SEA bounding box (Avalon, CA)", () => {
  const events = extractInScopeEvents(collectionOf(avalonCaOutsideScope));
  assert.equal(events.length, 0);
});

test("extractInScopeEvents handles a null PAGER alert without crashing", () => {
  // Avalon is out of scope, so pair it with an in-scope point that also
  // carries a null alert to confirm null survives extraction intact.
  const nullAlertInScope: UsgsFeature = {
    ...javaSeaInsideScope,
    id: "us_null_alert",
    properties: { ...javaSeaInsideScope.properties, alert: null },
  };
  const events = extractInScopeEvents(collectionOf(avalonCaOutsideScope, nullAlertInScope));
  assert.equal(events.length, 1);
  assert.equal(events[0].alert, null);
});

test("extractInScopeEvents sorts by most recent first", () => {
  const earlier: UsgsFeature = {
    ...javaSeaInsideScope,
    id: "earlier",
    properties: { ...javaSeaInsideScope.properties, time: javaSeaInsideScope.properties.time - 1000 },
  };
  const events = extractInScopeEvents(collectionOf(earlier, javaSeaInsideScope));
  assert.deepEqual(
    events.map((e) => e.id),
    ["us7000abcd", "earlier"],
  );
});

test("extractInScopeEvents converts epoch-millisecond time to a readable UTC string", () => {
  const events = extractInScopeEvents(collectionOf(javaSeaInsideScope));
  assert.equal(events[0].timeUtc, new Date(javaSeaInsideScope.properties.time).toUTCString());
});

test("extractInScopeEvents skips features with malformed/missing geometry instead of crashing", () => {
  const malformed: UsgsFeature = {
    ...javaSeaInsideScope,
    id: "malformed",
    geometry: null,
  };
  const events = extractInScopeEvents(collectionOf(malformed, javaSeaInsideScope));
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "us7000abcd");
});

test("buildQueryUrl bounds the request server-side to the SEA box (ADR-0002)", () => {
  const now = new Date("2026-07-08T00:00:00.000Z");
  const url = new URL(buildQueryUrl(now));
  assert.equal(url.origin + url.pathname, "https://earthquake.usgs.gov/fdsnws/event/1/query");
  assert.equal(url.searchParams.get("format"), "geojson");
  assert.equal(url.searchParams.get("starttime"), "2026-06-08");
  assert.equal(url.searchParams.get("minlatitude"), String(SEA_BOUNDING_BOX.minLat));
  assert.equal(url.searchParams.get("maxlatitude"), String(SEA_BOUNDING_BOX.maxLat));
  assert.equal(url.searchParams.get("minlongitude"), String(SEA_BOUNDING_BOX.minLon));
  assert.equal(url.searchParams.get("maxlongitude"), String(SEA_BOUNDING_BOX.maxLon));
});

test("renderEventsPage renders a table row for each in-scope event, escaping content", () => {
  const events = extractInScopeEvents(collectionOf(javaSeaInsideScope));
  const html = renderEventsPage(events, new Date("2026-07-08T00:00:00.000Z"));
  assert.match(html, /USGS Earthquakes — Southeast Asia/);
  assert.match(html, /112 km SSE of Tuban, Indonesia/);
  assert.match(html, /<td>5\.8<\/td>/);
  assert.match(html, /href="https:\/\/earthquake\.usgs\.gov\/earthquakes\/eventpage\/us7000abcd"/);
});

test("renderEventsPage renders an honest empty state, not an error, for zero in-scope events", () => {
  const html = renderEventsPage([], new Date("2026-07-08T00:00:00.000Z"));
  assert.match(html, /class="empty"/);
  assert.match(html, /No earthquakes currently/);
  assert.doesNotMatch(html, /<table>/);
});

test("renderEventsPage shows a dash rather than crashing for a null PAGER alert", () => {
  const nullAlertInScope: UsgsFeature = {
    ...javaSeaInsideScope,
    properties: { ...javaSeaInsideScope.properties, alert: null },
  };
  const events = extractInScopeEvents(collectionOf(nullAlertInScope));
  const html = renderEventsPage(events, new Date());
  assert.match(html, /<td>—<\/td>/);
});
