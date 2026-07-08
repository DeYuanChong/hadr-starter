import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractGdacsRecord,
  filterInScopeRecords,
  isRecordInScope,
  parseGdacsEventList,
  renderGdacsEventsPage,
  type GdacsRecord,
} from "./index";
import {
  japanEarthquakeFeature,
  malformedFeatures,
  missingIso3Feature,
  multiCountryCycloneFeature,
  philippinesEarthquakeFeature,
} from "./fixtures";

test("extractGdacsRecord: pulls the documented fields off a well-formed feature", () => {
  const record = extractGdacsRecord(philippinesEarthquakeFeature);
  assert.ok(record);
  assert.equal(record.name, "Earthquake in Philippines");
  assert.equal(record.hazardType, "EQ");
  assert.equal(record.country, "Philippines");
  assert.equal(record.alertLevel, "Green");
  assert.equal(record.fromDate, "2026-07-07T20:37:40");
  assert.equal(
    record.reportUrl,
    "https://www.gdacs.org/report.aspx?eventid=1550700&episodeid=1716900&eventtype=EQ",
  );
  assert.deepEqual(record.iso3Codes, ["PHL"]);
});

test("isRecordInScope: an in-scope country (Philippines) passes the filter", () => {
  const record = extractGdacsRecord(philippinesEarthquakeFeature);
  assert.ok(record);
  assert.equal(isRecordInScope(record), true);
});

test("isRecordInScope: an out-of-scope country (Japan, from feeds/gdacs.md) is filtered out", () => {
  const record = extractGdacsRecord(japanEarthquakeFeature);
  assert.ok(record);
  assert.deepEqual(record.iso3Codes, ["JPN"]);
  assert.equal(isRecordInScope(record), false);
});

test("filterInScopeRecords: keeps only the in-scope record out of a mixed list", () => {
  const records = parseGdacsEventList({
    type: "FeatureCollection",
    features: [japanEarthquakeFeature, philippinesEarthquakeFeature],
  });
  assert.equal(records.length, 2);

  const inScope = filterInScopeRecords(records);
  assert.equal(inScope.length, 1);
  assert.equal(inScope[0].country, "Philippines");
});

test("multi-country event: included when any affected country is in scope, even though top-level iso3 is not", () => {
  const record = extractGdacsRecord(multiCountryCycloneFeature);
  assert.ok(record);
  // Top-level iso3 alone (CHN) would be out of scope; affectedcountries
  // supplies PHL, which must be enough to bring the record into scope.
  assert.ok(record.iso3Codes.includes("CHN"));
  assert.ok(record.iso3Codes.includes("PHL"));
  assert.equal(isRecordInScope(record), true);
});

test("multi-country event: full country string is preserved, not clipped to SEA-only countries (ADR-0003)", () => {
  const record = extractGdacsRecord(multiCountryCycloneFeature);
  assert.ok(record);
  assert.equal(record.country, "Philippines, Taiwan, China");
});

test("missing/empty iso3: does not crash and is treated as out of scope", () => {
  const record = extractGdacsRecord(missingIso3Feature);
  assert.ok(record);
  assert.deepEqual(record.iso3Codes, []);
  assert.equal(isRecordInScope(record), false);
});

test("malformed feature (not an object) is skipped, not thrown", () => {
  assert.doesNotThrow(() => extractGdacsRecord(malformedFeatures.notAnObject));
  assert.equal(extractGdacsRecord(malformedFeatures.notAnObject), null);
});

test("malformed feature (no properties) is skipped, not thrown", () => {
  assert.doesNotThrow(() => extractGdacsRecord(malformedFeatures.noProperties));
  assert.equal(extractGdacsRecord(malformedFeatures.noProperties), null);
});

test("malformed iso3 (wrong type) degrades gracefully instead of crashing", () => {
  // Calling this directly (rather than via assert.doesNotThrow) is enough:
  // an uncaught throw here would fail the test on its own.
  const record: GdacsRecord | null = extractGdacsRecord(malformedFeatures.iso3WrongType);
  assert.ok(record);
  assert.deepEqual(record.iso3Codes, []);
  assert.equal(isRecordInScope(record), false);
});

test("malformed affectedcountries (wrong type) degrades gracefully instead of crashing", () => {
  const record: GdacsRecord | null = extractGdacsRecord(malformedFeatures.affectedCountriesWrongType);
  assert.ok(record);
  assert.deepEqual(record.iso3Codes, []);
});

test("parseGdacsEventList: one malformed feature among valid ones doesn't take down the run", () => {
  const records = parseGdacsEventList({
    type: "FeatureCollection",
    features: [
      philippinesEarthquakeFeature,
      malformedFeatures.notAnObject,
      malformedFeatures.noProperties,
      japanEarthquakeFeature,
    ],
  });
  // Both malformed entries are skipped; both well-formed ones survive.
  assert.equal(records.length, 2);
});

test("parseGdacsEventList: unexpected top-level shape returns zero records instead of throwing", () => {
  assert.doesNotThrow(() => {
    const records = parseGdacsEventList({ nothing: "here" });
    assert.deepEqual(records, []);
  });
  assert.doesNotThrow(() => {
    const records = parseGdacsEventList(null);
    assert.deepEqual(records, []);
  });
});

test("renderGdacsEventsPage: renders an honest empty state when nothing is in scope", () => {
  const html = renderGdacsEventsPage([], new Date("2026-07-08T00:00:00Z"));
  assert.match(html, /No in-scope GDACS events at time of fetch/);
  assert.match(html, /GDACS Events — Southeast Asia/);
  assert.doesNotMatch(html, /<table/);
});

test("renderGdacsEventsPage: renders a table row per in-scope record and escapes unsafe content", () => {
  const record = extractGdacsRecord(philippinesEarthquakeFeature);
  assert.ok(record);
  const unsafe = { ...record, name: `<script>alert("x")</script>` };
  const html = renderGdacsEventsPage([unsafe], new Date("2026-07-08T00:00:00Z"));
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Philippines/);
});
