import { test } from "node:test";
import assert from "node:assert/strict";

import { assignTriage } from "./triage.js";

test("assignTriage: EQ Green and none tiers are suppressed; above-Green EQ is reported", () => {
  assert.equal(assignTriage("Green", null, "EQ").suppressed, true, "Green EQ");
  assert.equal(assignTriage(null, null, "EQ").suppressed, true, "none EQ (no alert)");
  assert.equal(assignTriage("Orange", null, "EQ").suppressed, false, "Orange EQ");
  assert.equal(assignTriage(null, "yellow", "EQ").suppressed, false, "PAGER-yellow EQ");
  assert.equal(assignTriage("Green", "orange", "EQ").suppressed, false, "Green GDACS + orange PAGER -> orange, reported");
});

test("assignTriage: non-EQ hazards are never tier-suppressed, even at Green/none", () => {
  assert.equal(assignTriage("Green", null, "FL").suppressed, false, "Green flood");
  assert.equal(assignTriage("Green", null, "TC").suppressed, false, "Green tropical cyclone");
  assert.equal(assignTriage("Green", null, "VO").suppressed, false, "Green volcano");
  assert.equal(assignTriage(null, null, "FL").suppressed, false, "no-alert flood");
});

test("assignTriage: hazardType is case-insensitive", () => {
  assert.equal(assignTriage("Green", null, "eq").suppressed, true, "lowercase eq still suppressed at Green");
  assert.equal(assignTriage("Green", null, "fl").suppressed, false, "lowercase fl still reported at Green");
});

test("assignTriage: triage severity is the higher of GDACS and PAGER regardless of hazard", () => {
  assert.equal(assignTriage("Green", "orange", "EQ").triageSeverity, "orange");
  assert.equal(assignTriage("Red", null, "FL").triageSeverity, "red");
  assert.equal(assignTriage(null, null, "EQ").triageSeverity, "none");
});