import { test } from "node:test";
import assert from "node:assert/strict";

import { renderDashboard } from "./render.js";

test("dashboard links to the About page from header and footer", () => {
  const html = renderDashboard([], [], new Date("2026-07-09T00:30:00Z"));
  const aboutLinks = html.split('href="about.html"').length - 1;
  assert.ok(aboutLinks >= 2, `expected header + footer About links, found ${aboutLinks}`);
});

test("dashboard footer states the sensing-layer boundary and links the JSON twin", () => {
  const html = renderDashboard([], [], new Date("2026-07-09T00:30:00Z"));
  assert.match(html, /does not dispatch or decide response/);
  assert.match(html, /href="dashboard-map\.json"/);
});
