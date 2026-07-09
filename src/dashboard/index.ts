/**
 * Dashboard entry point. Run via `npm run build:dashboard`.
 *
 * The stateful pipeline: load state.json (docs/adr/0012) → collect all three
 * feeds (USGS window extended back to the last successful cursor,
 * docs/adr/0011) → reconcile into Stories (EQ join) → run the state machine
 * against the prior run (docs/adr/0005: new / escalated / de-escalated /
 * revised / confirmed / deleted) → render the map situation report with its
 * "Since yesterday" section (docs/adr/0006) → persist the new state
 * atomically.
 *
 * Output is dashboard-map.html (the committed map situation report),
 * dashboard-map.json (the same data for a downstream agent, story 16), and
 * state.json (the persisted run state the next run diffs against). Each
 * invocation is one deterministic run, not a daemon (docs/adr/0010).
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { collect } from "./collect.js";
import { reconcile } from "./reconcile.js";
import { applyStateMachine, loadState, saveState } from "./state.js";
import { fetchImagery } from "./imagery.js";
import { buildStructuredOutput, renderDashboard } from "./render.js";

const HTML_PATH = fileURLToPath(new URL("../../dashboard-map.html", import.meta.url));
const JSON_PATH = fileURLToPath(new URL("../../dashboard-map.json", import.meta.url));
const STATE_PATH = fileURLToPath(new URL("../../state.json", import.meta.url));

async function main(): Promise<void> {
  const generatedAt = new Date();

  const prior = await loadState(STATE_PATH);
  const usgsCursor = prior?.cursors.usgs.lastSuccessAt;

  const { gdacs, usgs, reliefweb, health, usgsWindowStartMs, watermarks } = await collect({
    usgsExtendBackTo: usgsCursor ? new Date(usgsCursor) : undefined,
  });
  const stories = reconcile(gdacs, usgs, reliefweb);

  const machine = applyStateMachine(
    prior,
    stories,
    health,
    generatedAt,
    usgsWindowStartMs,
    watermarks,
  );

  // Satellite imagery for alerted areas (docs/adr/0018): fetched at build
  // time, embedded as data URIs. An enhancement, never signal — failures
  // just mean a story renders without an image.
  const imagery = await fetchImagery(stories, generatedAt);
  console.log(`[dashboard] Embedded satellite imagery for ${imagery.size} alerted stor${imagery.size === 1 ? "y" : "ies"}.`);

  const html = renderDashboard(stories, health, generatedAt, machine.changes, machine.priorRunAt, imagery);
  const json = JSON.stringify(
    buildStructuredOutput(stories, health, generatedAt, machine.changes, machine.priorRunAt, imagery),
    null,
    2,
  );

  await writeFile(HTML_PATH, html, "utf8");
  await writeFile(JSON_PATH, json, "utf8");
  await saveState(STATE_PATH, machine.nextState);

  const reported = stories.filter((s) => !s.suppressed).length;
  const reconciled = stories.filter((s) => s.reconciled).length;
  console.log(
    `[dashboard] ${stories.length} stor${stories.length === 1 ? "y" : "ies"} ` +
      `(${reported} reported, ${stories.length - reported} suppressed, ${reconciled} reconciled). ` +
      `Feed health: ${health.map((h) => `${h.feed}=${h.status}`).join(", ")}.`,
  );
  console.log(
    machine.priorRunAt === null
      ? "[dashboard] First run — no prior state; change tracking starts next run."
      : `[dashboard] ${machine.changes.length} change(s) since ${machine.priorRunAt}.`,
  );
  console.log(
    `[dashboard] Wrote ${path.basename(HTML_PATH)}, ${path.basename(JSON_PATH)}, ${path.basename(STATE_PATH)}.`,
  );
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("[dashboard] Build failed:", err);
    process.exitCode = 1;
  });
}
