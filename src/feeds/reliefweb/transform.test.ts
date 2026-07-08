import { test } from "node:test";
import assert from "node:assert/strict";

import { anyInSeaScope, extractCountryNames, parseSeaEvents } from "./transform.js";
import { FIXTURE_RSS_XML } from "./fixture.js";

test("extracts a single affected country from the singular 'country' div", () => {
  const names = extractCountryNames(
    '&lt;div class="tag country"&gt;Affected country: Myanmar&lt;/div&gt;'
  );
  assert.deepEqual(names, ["Myanmar"]);
});

test("extracts multiple affected countries from the plural 'countries' div", () => {
  const names = extractCountryNames(
    '&lt;div class="tag country"&gt;Affected countries: Indonesia, Philippines&lt;/div&gt;'
  );
  assert.deepEqual(names, ["Indonesia", "Philippines"]);
});

test("real-shaped description with glide tag and body paragraph still extracts cleanly", () => {
  const names = extractCountryNames(
    '&lt;div class="tag country"&gt;Affected country: Venezuela (Bolivarian Republic of)&lt;/div&gt;' +
      '&lt;div class="tag glide"&gt;Glide: EQ-2026-000093-VEN&lt;/div&gt;' +
      "&lt;p&gt;On 24 June 2026, two strong earthquakes struck...&lt;/p&gt;"
  );
  assert.deepEqual(names, ["Venezuela (Bolivarian Republic of)"]);
});

test("missing or unrelated description returns no countries, without throwing", () => {
  assert.deepEqual(extractCountryNames(null), []);
  assert.deepEqual(extractCountryNames(undefined), []);
  assert.deepEqual(extractCountryNames("<p>no country tag here at all</p>"), []);
});

test("malformed (unterminated) description HTML does not crash extraction", () => {
  const malformed = '&lt;div class="tag country"&gt;Affected country: Myanmar'; // no closing div
  assert.doesNotThrow(() => extractCountryNames(malformed));
  assert.deepEqual(extractCountryNames(malformed), []);
});

test("anyInSeaScope is true when at least one extracted name is in scope", () => {
  assert.equal(anyInSeaScope(["Indonesia", "Georgia"]), true);
  assert.equal(anyInSeaScope(["Venezuela (Bolivarian Republic of)"]), false);
  assert.equal(anyInSeaScope([]), false);
});

test("parseSeaEvents filters the non-SEA Venezuela item out and keeps the SEA Myanmar item", () => {
  const events = parseSeaEvents(FIXTURE_RSS_XML);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Myanmar: Floods - Jun 2026 (fixture)");
  assert.deepEqual(events[0].countries, ["Myanmar"]);
  assert.equal(events[0].link, "https://reliefweb.int/disaster/fl-2026-000104-mmr");
});

test("a document with no <item> blocks at all yields zero events, not a crash", () => {
  assert.deepEqual(parseSeaEvents("<rss><channel></channel></rss>"), []);
});

test("an item missing title or link is dropped rather than shown incomplete", () => {
  const xml = `<rss><channel>
    <item>
      <link>https://reliefweb.int/disaster/x</link>
      <description>&lt;div class="tag country"&gt;Affected country: Myanmar&lt;/div&gt;</description>
    </item>
  </channel></rss>`;
  assert.deepEqual(parseSeaEvents(xml), []);
});
