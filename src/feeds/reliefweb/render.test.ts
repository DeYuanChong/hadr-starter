import { test } from "node:test";
import assert from "node:assert/strict";

import { renderReliefWebPage } from "./render.js";

const FIXED_DATE = new Date("2026-07-08T00:00:00Z");

test("renders an honest empty state when there are zero in-scope events, not an error", () => {
  const html = renderReliefWebPage([], { status: "live", fetchedAt: FIXED_DATE });
  assert.match(html, /No Southeast Asia disasters currently in scope/);
  assert.match(html, /expected, not an error/);
});

test("labels fixture-sourced output honestly, never presenting it as live", () => {
  const html = renderReliefWebPage([], {
    status: "fixture",
    fetchedAt: FIXED_DATE,
    reason: "HTTP 403 Forbidden",
  });
  assert.match(html, /unreachable/i);
  assert.match(html, /fixture data for demonstration only/i);
  assert.match(html, /HTTP 403 Forbidden/);
});

test("labels an unavailable source honestly", () => {
  const html = renderReliefWebPage([], {
    status: "unavailable",
    fetchedAt: FIXED_DATE,
    reason: "parse failure: boom",
  });
  assert.match(html, /ReliefWeb: unavailable/);
});

test("renders a table row per event with title, country, date, and link, no body text", () => {
  const html = renderReliefWebPage(
    [
      {
        title: "Myanmar: Floods - Jun 2026",
        countries: ["Myanmar"],
        pubDate: "Fri, 19 Jun 2026 00:00:00 +0000",
        link: "https://reliefweb.int/disaster/fl-2026-000104-mmr",
      },
    ],
    { status: "live", fetchedAt: FIXED_DATE }
  );
  assert.match(html, /Myanmar: Floods - Jun 2026/);
  assert.match(html, /Myanmar/);
  assert.match(html, /Fri, 19 Jun 2026/);
  assert.match(html, /https:\/\/reliefweb\.int\/disaster\/fl-2026-000104-mmr/);
  assert.equal(html.includes("ReliefWeb"), true);
});
