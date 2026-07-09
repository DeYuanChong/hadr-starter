import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bboxForStory,
  dayBefore,
  imageDateForStory,
  MAX_IMAGES,
  pickImageryTargets,
  snapshotUrl,
  worldviewUrl,
} from "./imagery.js";
import type { Story } from "../shared/story.js";

const NOW = new Date("2026-07-09T00:30:00Z"); // an 08:30 SGT publish run

function story(overrides: Partial<Story> = {}): Story {
  const base: Story = {
    id: "us1",
    hazardType: "EQ",
    title: "M6.7 test quake",
    countries: ["Indonesia"],
    lat: -1.12,
    lon: 120.2,
    timeUtc: "Tue, 16 Jun 2026 03:27:44 GMT",
    mag: 6.7,
    gdacsAlert: null,
    pagerAlert: "yellow",
    triageSeverity: "yellow",
    suppressed: false,
    reconciled: false,
    aliases: ["us1"],
    state: "unchanged",
    sources: [{ feed: "usgs", url: null }],
    supplementary: [],
  };
  return { ...base, ...overrides };
}

test("bbox: regional box for point hazards, synoptic box for cyclones/droughts", () => {
  const eq = bboxForStory(story())!;
  assert.equal(eq.latMax - eq.latMin, 1.5, "EQ gets a ~165km box");

  const tc = bboxForStory(story({ hazardType: "TC" }))!;
  assert.equal(tc.latMax - tc.latMin, 6, "cyclone gets a synoptic-scale box");
});

test("bbox: clamps at the antimeridian/pole edges and is null without a coordinate", () => {
  const edge = bboxForStory(story({ lat: 89.9, lon: 179.9, hazardType: "TC" }))!;
  assert.equal(edge.latMax, 90);
  assert.equal(edge.lonMax, 180);
  assert.equal(bboxForStory(story({ lat: null, lon: null })), null);
});

test("image date: the event's own (completed) UTC day", () => {
  assert.equal(imageDateForStory(story(), NOW), "2026-06-16");
});

test("image date: never 'today' — a same-day event falls back to yesterday's composite", () => {
  const today = story({ timeUtc: "Thu, 09 Jul 2026 00:05:00 GMT" });
  assert.equal(imageDateForStory(today, NOW), "2026-07-08");
  // No parseable time at all → also yesterday.
  assert.equal(imageDateForStory(story({ timeUtc: null }), NOW), "2026-07-08");
});

test("dayBefore steps a date back across month boundaries", () => {
  assert.equal(dayBefore("2026-07-01"), "2026-06-30");
});

test("snapshot URL: lat-first BBOX, the requested date, and JPEG output", () => {
  const url = snapshotUrl(bboxForStory(story())!, "2026-06-16");
  assert.match(url, /BBOX=-1\.87%2C119\.45%2C-0\.37%2C120\.95/, "BBOX is latMin,lonMin,latMax,lonMax");
  assert.match(url, /TIME=2026-06-16/);
  assert.match(url, /FORMAT=image%2Fjpeg/);
  assert.match(url, /VIIRS_SNPP_CorrectedReflectance_TrueColor/);
});

test("worldview URL: lon-first viewport, same date", () => {
  const url = worldviewUrl(bboxForStory(story())!, "2026-06-16");
  assert.match(url, /v=119\.45,-1\.87,120\.95,-0\.37/, "v viewport is lon-first");
  assert.match(url, /t=2026-06-16/);
});

test("target selection: reported + mappable only, severity-first, capped", () => {
  const stories: Story[] = [
    story({ id: "suppressed", suppressed: true }), // out: suppressed
    story({ id: "nocoord", lat: null, lon: null }), // out: no coordinate
    story({ id: "orange", triageSeverity: "orange" }),
    story({ id: "yellow", triageSeverity: "yellow" }),
    story({ id: "red", triageSeverity: "red" }),
  ];
  const targets = pickImageryTargets(stories);
  assert.deepEqual(
    targets.map((s) => s.id),
    ["red", "orange", "yellow"],
    "most severe first, ineligible stories excluded",
  );

  const many = Array.from({ length: 20 }, (_, i) => story({ id: `s${i}` }));
  assert.equal(pickImageryTargets(many).length, MAX_IMAGES, "page weight stays bounded");
});
