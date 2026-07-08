/**
 * ReliefWeb feed fetcher entry point. Run via `npm run fetch:reliefweb`.
 *
 * Per docs/adr/0013: always attempts the real, live RSS fetch first (with a
 * browser-style User-Agent, since reliefweb.int can 403 non-browser
 * clients). Only if that genuinely fails does it fall back to a local
 * fixture — and the rendered page always says honestly which one produced
 * its contents; fixture data is never silently presented as live.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchLiveRss } from "./adapter.js";
import { FIXTURE_RSS_XML } from "./fixture.js";
import { parseSeaEvents } from "./transform.js";
import { renderReliefWebPage } from "./render.js";
import type { ReliefWebEvent, ReliefWebSourceStatus } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/feeds/reliefweb/index.ts -> repo root -> events/reliefweb.html
const OUTPUT_PATH = path.join(__dirname, "..", "..", "..", "events", "reliefweb.html");

async function main(): Promise<void> {
  const fetchedAt = new Date();

  const live = await fetchLiveRss();

  let xml: string | null;
  let status: ReliefWebSourceStatus;
  let reason: string | undefined;

  if (live.ok && live.xml) {
    xml = live.xml;
    status = "live";
    console.log("ReliefWeb RSS: live fetch succeeded.");
  } else {
    reason = live.reason ?? "unknown error";
    console.warn(
      `ReliefWeb RSS: live fetch failed (${reason}); falling back to local fixture for this run.`
    );
    xml = FIXTURE_RSS_XML;
    status = "fixture";
  }

  let events: ReliefWebEvent[] = [];
  try {
    events = parseSeaEvents(xml);
  } catch (err) {
    // Belt-and-braces: even the fixture failed to parse. Report honestly
    // rather than crash the run (per ADR-0013's "ReliefWeb: unavailable").
    status = "unavailable";
    reason = `parse failure: ${err instanceof Error ? err.message : String(err)}`;
    events = [];
  }

  const html = renderReliefWebPage(events, { status, fetchedAt, reason });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, html, "utf8");

  console.log(
    `Wrote ${events.length} in-scope SEA item(s) to ${OUTPUT_PATH} (source: ${status}).`
  );
}

main().catch((err) => {
  console.error("ReliefWeb fetch failed unexpectedly:", err);
  process.exitCode = 1;
});
