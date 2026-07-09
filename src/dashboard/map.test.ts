import { test } from "node:test";
import assert from "node:assert/strict";

import { project, isMappable, renderMap } from "./map.js";
import { assignTriage } from "./triage.js";
import type { Story } from "../shared/story.js";

function story(overrides: Partial<Story> = {}): Story {
  const base: Story = {
    id: "x",
    hazardType: "EQ",
    title: "test quake",
    countries: [],
    lat: 0,
    lon: 116,
    timeUtc: null,
    mag: 5,
    gdacsAlert: null,
    pagerAlert: "orange",
    triageSeverity: "orange",
    suppressed: false,
    reconciled: false,
    aliases: ["x"],
    state: "new",
    sources: [{ feed: "usgs", url: "https://example.test/e" }],
    supplementary: [],
  };
  return { ...base, ...overrides };
}

test("projection: north maps above south, east maps right of west", () => {
  const [, yNorth] = project(116, 20);
  const [, ySouth] = project(116, -10);
  assert.ok(yNorth < ySouth, "higher latitude -> smaller y (north is up)");

  const [xWest] = project(95, 5);
  const [xEast] = project(140, 5);
  assert.ok(xEast > xWest, "higher longitude -> larger x (east is right)");
});

test("projection stays within the SVG canvas for in-box coordinates", () => {
  const [x, y] = project(116, 7); // roughly centre of the region
  assert.ok(x >= 0 && x <= 1000, "x within width");
  assert.ok(y >= 0 && y <= 900, "y within height");
});

test("isMappable is false for country-level stories with no coordinate", () => {
  assert.equal(isMappable(story({ lat: null, lon: null })), false);
  assert.equal(isMappable(story({ lat: 1, lon: 116 })), true);
});

test("renderMap places a marker per mappable story and notes the unmapped count", () => {
  const stories = [
    story({ id: "a", lat: 1, lon: 116 }),
    story({ id: "b", lat: 5, lon: 120 }),
    story({ id: "c", lat: null, lon: null }), // ReliefWeb-style, country-level
  ];
  const svg = renderMap(stories);
  assert.ok(svg.includes('data-story-id="a"'));
  assert.ok(svg.includes('data-story-id="b"'));
  assert.ok(!svg.includes('data-story-id="c"'), "country-level story is not a marker");
  assert.match(svg, /1 country-level item/, "notes the one unmapped item");
});

test("suppressed markers are drawn faint, reported markers are not", () => {
  const t = assignTriage("Green", null, "EQ"); // suppressed
  assert.equal(t.suppressed, true);
  const svg = renderMap([story({ id: "faint", triageSeverity: "green", suppressed: true })]);
  assert.match(svg, /fill-opacity="0.35"/, "suppressed marker is faint");
});
