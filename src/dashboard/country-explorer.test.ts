import { test } from "node:test";
import assert from "node:assert/strict";

import { COUNTRY_INFO } from "./country-info.js";
import { SEA_COUNTRIES_ISO3 } from "../shared/sea-scope.js";
import { renderMap } from "./map.js";
import { renderDashboard, type FeedHealth } from "./render.js";
import type { Story } from "../shared/story.js";

const HEALTH: FeedHealth[] = [
  { feed: "gdacs", status: "live", detail: "test" },
  { feed: "usgs", status: "live", detail: "test" },
  { feed: "reliefweb", status: "fixture", detail: "test" },
];

function story(overrides: Partial<Story> = {}): Story {
  const base: Story = {
    id: "s1",
    hazardType: "TC",
    title: "Test cyclone",
    countries: ["Philippines"],
    lat: 13,
    lon: 122,
    timeUtc: "Tue, 07 Jul 2026 20:37:40 GMT",
    mag: null,
    gdacsAlert: "Orange",
    pagerAlert: null,
    triageSeverity: "orange",
    suppressed: false,
    reconciled: false,
    aliases: ["s1"],
    state: "new",
    sources: [{ feed: "gdacs", url: "https://example.test/g" }],
    supplementary: [],
  };
  return { ...base, ...overrides };
}

test("country-info: exactly the 11 ADR-0001 countries, each fully populated", () => {
  assert.equal(COUNTRY_INFO.length, 11);
  const iso3s = new Set(COUNTRY_INFO.map((c) => c.iso3));
  assert.deepEqual([...iso3s].sort(), [...SEA_COUNTRIES_ISO3].sort());
  for (const c of COUNTRY_INFO) {
    assert.ok(c.flagDataUri.startsWith("data:image/png;base64,"), `${c.iso3} flag is embedded`);
    assert.ok(c.summary.length > 50, `${c.iso3} has a real summary`);
    assert.ok(c.summary.length <= 600, `${c.iso3} summary stays short`);
    assert.match(c.wikiUrl, /wikipedia\.org/, `${c.iso3} links back to Wikipedia`);
  }
});

test("map: country paths are selectable (data-iso3 + keyboard focusable)", () => {
  const svg = renderMap([story()]);
  assert.ok(svg.includes('data-iso3="IDN"'), "Indonesia path is wired");
  assert.ok(svg.includes('data-iso3="SGP"'), "Singapore (added polygon) is wired");
  assert.match(svg, /class="land" [^>]*tabindex="0"/, "paths are keyboard focusable");
});

test("dashboard embeds the country explorer: chips, panel, data blob, script", () => {
  const html = renderDashboard([story()], HEALTH, new Date("2026-07-08T00:30:00Z"));
  assert.ok(html.includes('id="country-panel"'), "panel present");
  assert.ok(html.includes('id="country-data"'), "embedded JSON blob present");
  assert.match(html, /<button class="chip" type="button" data-iso3="THA">/, "chips render");
  assert.match(html, /#country=\(\[A-Z\]\{3\}\)/, "hash deep-link wiring present");
  // Wikipedia licensing: attribution + link must accompany the summaries.
  assert.match(html, /Wikipedia<\/a> \(CC BY-SA 4\.0\)/, "CC BY-SA attribution present");
  // Regressions caught by the hosted-page e2e run (2026-07-08): author
  // display:flex beat the hidden attribute, and same-document hash
  // navigation never re-ran the init.
  assert.ok(
    html.includes(".country-panel[hidden] { display: none; }"),
    "panel can actually hide: [hidden] must beat display:flex",
  );
  assert.ok(html.includes('addEventListener("hashchange"'), "hashchange navigation wired");
});

test("dashboard country data carries per-country story counts by name", () => {
  const stories = [
    story({ id: "a", countries: ["Philippines"], suppressed: false }),
    story({ id: "b", countries: ["Philippines", "Viet Nam"], suppressed: true }),
    story({ id: "c", countries: [], suppressed: true }), // USGS point-only: attributed to nobody
  ];
  const html = renderDashboard(stories, HEALTH, new Date("2026-07-08T00:30:00Z"));
  const blob = html.match(/<script type="application\/json" id="country-data">(.*?)<\/script>/s);
  assert.ok(blob, "data blob found");
  const data = JSON.parse(blob![1]);
  assert.equal(data.PHL.reported, 1);
  assert.equal(data.PHL.suppressed, 1);
  assert.equal(data.VNM.suppressed, 1, "long-form country name resolves");
  assert.equal(data.IDN.reported + data.IDN.suppressed, 0, "unnamed country stays zero");
  assert.ok(data.PHL.summary.length > 0 && data.PHL.wikiUrl.includes("wikipedia.org"));
});
