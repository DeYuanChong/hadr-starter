import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeEntities, extractItemBlocks, parseRssItems } from "./xml.js";
import { FIXTURE_RSS_XML } from "./fixture.js";

test("extracts one block per <item>", () => {
  const blocks = extractItemBlocks(FIXTURE_RSS_XML);
  assert.equal(blocks.length, 2);
});

test("parses title/link/pubDate/description out of a flat item", () => {
  const [venezuela] = parseRssItems(FIXTURE_RSS_XML);
  assert.equal(venezuela.title, "Venezuela: Earthquakes - Jun 2026");
  assert.equal(venezuela.link, "https://reliefweb.int/disaster/eq-2026-000093-ven");
  assert.match(venezuela.pubDate ?? "", /24 Jun 2026/);
  assert.match(venezuela.description ?? "", /Affected country/);
});

test("decodeEntities turns escaped description HTML back into real tags", () => {
  const decoded = decodeEntities(
    '&lt;div class="tag country"&gt;Affected country: Myanmar&lt;/div&gt;'
  );
  assert.equal(decoded, '<div class="tag country">Affected country: Myanmar</div>');
});

test("missing tags come back as null rather than throwing", () => {
  const [item] = parseRssItems("<item><title>No link or date</title></item>");
  assert.equal(item.title, "No link or date");
  assert.equal(item.link, null);
  assert.equal(item.pubDate, null);
  assert.equal(item.description, null);
});

test("an XML document with no <item> elements yields an empty array, not a throw", () => {
  assert.deepEqual(extractItemBlocks("<rss><channel><title>Empty</title></channel></rss>"), []);
  assert.deepEqual(parseRssItems("<rss><channel><title>Empty</title></channel></rss>"), []);
});
