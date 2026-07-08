import { test } from "node:test";
import assert from "node:assert/strict";

import { seaIso3ForCountryName } from "./country-names.js";

test("matches common SEA short names", () => {
  assert.equal(seaIso3ForCountryName("Myanmar"), "MMR");
  assert.equal(seaIso3ForCountryName("Philippines"), "PHL");
  assert.equal(seaIso3ForCountryName("Indonesia"), "IDN");
});

test("matches official long-form names ReliefWeb may use", () => {
  assert.equal(seaIso3ForCountryName("Lao People's Democratic Republic"), "LAO");
  assert.equal(seaIso3ForCountryName("Viet Nam"), "VNM");
  assert.equal(seaIso3ForCountryName("Brunei Darussalam"), "BRN");
  assert.equal(seaIso3ForCountryName("Timor-Leste"), "TLS");
});

test("is case-insensitive and tolerant of surrounding whitespace", () => {
  assert.equal(seaIso3ForCountryName("  myanmar  "), "MMR");
  assert.equal(seaIso3ForCountryName("MYANMAR"), "MMR");
});

test("does not match a non-SEA country, including one with a parenthetical qualifier", () => {
  assert.equal(seaIso3ForCountryName("Venezuela (Bolivarian Republic of)"), null);
  assert.equal(seaIso3ForCountryName("Georgia"), null);
  assert.equal(seaIso3ForCountryName(""), null);
});
