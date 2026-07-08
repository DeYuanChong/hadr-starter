/**
 * Dashboard entry point. Run via `npm run build:dashboard`.
 *
 * Orchestrates the one-shot pipeline: collect all three feeds → reconcile
 * into Stories (EQ join) → triage/suppress → render the map situation report
 * to dashboard-map.html, and the machine-readable payload to
 * dashboard-map.json (story 16). This is a single deterministic run, not a scheduled daemon
 * (docs/adr/0010) — scheduling it at 08:30 SGT is a separate concern.
 *
 * Output is dashboard-map.html (the committed map situation report) and
 * dashboard-map.json (the same data for a downstream agent, story 16). The
 * "-map" suffix keeps this deterministic pipeline's output distinct from any
 * other dashboard producer that also targets the repo root.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { collect } from "./collect.js";
import { reconcile } from "./reconcile.js";
import { buildStructuredOutput, renderDashboard } from "./render.js";

const HTML_PATH = fileURLToPath(new URL("../../dashboard-map.html", import.meta.url));
const JSON_PATH = fileURLToPath(new URL("../../dashboard-map.json", import.meta.url));

async function main(): Promise<void> {
  const generatedAt = new Date();

  const { gdacs, usgs, reliefweb, health } = await collect();
  const stories = reconcile(gdacs, usgs, reliefweb);

  const html = renderDashboard(stories, health, generatedAt);
  const json = JSON.stringify(buildStructuredOutput(stories, health, generatedAt), null, 2);

  await writeFile(HTML_PATH, html, "utf8");
  await writeFile(JSON_PATH, json, "utf8");

  const reported = stories.filter((s) => !s.suppressed).length;
  const reconciled = stories.filter((s) => s.reconciled).length;
  console.log(
    `[dashboard] ${stories.length} stor${stories.length === 1 ? "y" : "ies"} ` +
      `(${reported} reported, ${stories.length - reported} suppressed, ${reconciled} reconciled). ` +
      `Feed health: ${health.map((h) => `${h.feed}=${h.status}`).join(", ")}.`,
  );
  console.log(`[dashboard] Wrote ${path.basename(HTML_PATH)} and ${path.basename(JSON_PATH)}.`);
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("[dashboard] Build failed:", err);
    process.exitCode = 1;
  });
}
