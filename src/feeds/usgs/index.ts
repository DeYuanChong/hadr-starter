/**
 * USGS earthquake feed fetcher.
 *
 * Fetches recent earthquakes from USGS's FDSN event query API, bounded
 * server-side to the Southeast Asia scope (docs/adr/0002-sea-bounding-box.md),
 * double-checks each result client-side against the same box as a defensive
 * guard, and renders a plain events page listing the in-scope records.
 *
 * This produces feed *records* (see CONTEXT.md's "Story" vs. "record"
 * distinction), not reconciled Stories: no GDACS join, no triage severity,
 * no state machine, no persistence between runs. Those are later
 * full-dashboard concerns (docs/adr/0004 onward) — out of scope here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPointInScope, SEA_BOUNDING_BOX } from "../../shared/sea-scope.js";
import { escapeHtml, renderPage } from "../../shared/html.js";

const FDSN_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const LOOKBACK_DAYS = 30;
const FETCH_TIMEOUT_MS = 15_000;

/** Shape of a single GeoJSON feature in a USGS FDSN/summary response. */
export interface UsgsFeature {
  type?: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    alert: string | null;
    url?: string | null;
    [key: string]: unknown;
  };
  geometry: {
    type?: string;
    /** [longitude, latitude, depth?] per GeoJSON convention. */
    coordinates: [number, number, number?];
  } | null;
  id: string;
}

/** Shape of a USGS FDSN/summary GeoJSON response, per feeds/usgs.md. */
export interface UsgsFeatureCollection {
  type?: string;
  metadata?: { generated?: number; title?: string; count?: number };
  features: UsgsFeature[];
}

/** A clean, SEA-filtered earthquake record extracted for the events page. */
export interface EarthquakeEvent {
  id: string;
  mag: number | null;
  place: string;
  lat: number;
  lon: number;
  time: number;
  /** `time` converted to a readable UTC date string. */
  timeUtc: string;
  /** USGS PAGER alert tier (green/yellow/orange/red), or null if not yet assessed. */
  alert: string | null;
  /** USGS's own link to the event page, if the response carried one. */
  url: string | null;
}

/**
 * Computes the query window start: the default lookback, extended further
 * back when the last successful poll is older than the lookback would cover
 * (docs/adr/0011 — the cursor makes downtime recoverable: however long the
 * gap, the next successful run still asks about everything it missed).
 */
export function computeQueryStart(now: Date = new Date(), extendBackTo?: Date): Date {
  const defaultStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  if (extendBackTo && extendBackTo.getTime() < defaultStart.getTime()) {
    return extendBackTo;
  }
  return defaultStart;
}

/**
 * Builds the FDSN query URL, bounding the request server-side to the SEA
 * box (ADR-0002) so the box is a query parameter, not a client-side
 * post-filter over the global feed.
 */
export function buildQueryUrl(now: Date = new Date(), extendBackTo?: Date): string {
  const start = computeQueryStart(now, extendBackTo);
  const starttime = start.toISOString().slice(0, 10); // ISO date, e.g. "2026-06-08"
  const params = new URLSearchParams({
    format: "geojson",
    starttime,
    minlatitude: String(SEA_BOUNDING_BOX.minLat),
    maxlatitude: String(SEA_BOUNDING_BOX.maxLat),
    minlongitude: String(SEA_BOUNDING_BOX.minLon),
    maxlongitude: String(SEA_BOUNDING_BOX.maxLon),
  });
  return `${FDSN_QUERY_URL}?${params.toString()}`;
}

/** Fetches and parses the FDSN GeoJSON response. Never called from tests. */
export async function fetchUsgsFeed(url: string): Promise<UsgsFeatureCollection> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`USGS FDSN query failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as UsgsFeatureCollection;
}

/**
 * Extracts a clean event list from GeoJSON features, filters to the SEA
 * bounding box client-side (defensive double-check on top of the
 * server-side query — see feeds/blindspots.md on USGS), and sorts by most
 * recent first.
 */
export function extractInScopeEvents(collection: UsgsFeatureCollection): EarthquakeEvent[] {
  const events: EarthquakeEvent[] = [];

  for (const feature of collection.features ?? []) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue; // malformed geometry — skip, don't crash
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") continue;

    // Defensive double-check: the FDSN query is already server-side bounded
    // (ADR-0002), but re-validate client-side in case of a query-parameter
    // mistake. Cheap, and this is the whole reason isPointInScope() exists.
    if (!isPointInScope(lat, lon)) continue;

    const props = feature.properties;
    events.push({
      id: feature.id,
      mag: typeof props.mag === "number" ? props.mag : null,
      place: props.place ?? "Unknown location",
      lat,
      lon,
      time: props.time,
      timeUtc: new Date(props.time).toUTCString(),
      alert: props.alert ?? null,
      url: typeof props.url === "string" ? props.url : null,
    });
  }

  return events.sort((a, b) => b.time - a.time);
}

function renderEventRow(event: EarthquakeEvent): string {
  const mag = event.mag === null ? "—" : event.mag.toFixed(1);
  const alert = event.alert === null ? "—" : escapeHtml(event.alert);
  const link = event.url
    ? `<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">USGS event page</a>`
    : "—";
  return `<tr><td>${escapeHtml(event.timeUtc)}</td><td>${escapeHtml(mag)}</td><td>${escapeHtml(event.place)}</td><td>${alert}</td><td>${link}</td></tr>`;
}

/** Renders the full events page: a table of in-scope events, or an honest empty state. */
export function renderEventsPage(events: EarthquakeEvent[], generatedAt: Date): string {
  const title = "USGS Earthquakes — Southeast Asia";
  const generatedLabel = generatedAt.toUTCString();
  const { minLat, maxLat, minLon, maxLon } = SEA_BOUNDING_BOX;
  const scopeLabel = `${minLon}°E–${maxLon}°E, ${Math.abs(minLat)}°S–${maxLat}°N`;

  const body =
    events.length === 0
      ? `<h1>${escapeHtml(title)}</h1>
<p class="meta">Generated ${escapeHtml(generatedLabel)} · source: USGS FDSN event query, past ${LOOKBACK_DAYS} days</p>
<p class="empty">No earthquakes currently in the Southeast Asia bounding box (${escapeHtml(scopeLabel)}) for the past ${LOOKBACK_DAYS} days.</p>`
      : `<h1>${escapeHtml(title)}</h1>
<p class="meta">Generated ${escapeHtml(generatedLabel)} · ${events.length} in-scope event${events.length === 1 ? "" : "s"} · source: USGS FDSN event query, past ${LOOKBACK_DAYS} days</p>
<table>
<thead><tr><th>Time (UTC)</th><th>Magnitude</th><th>Place</th><th>PAGER alert</th><th>Source</th></tr></thead>
<tbody>
${events.map(renderEventRow).join("\n")}
</tbody>
</table>`;

  return renderPage(title, body);
}

const OUTPUT_PATH = fileURLToPath(new URL("../../../events/usgs.html", import.meta.url));

async function main(): Promise<void> {
  const now = new Date();
  const url = buildQueryUrl(now);
  console.log(`Fetching USGS FDSN events:\n  ${url}`);

  const collection = await fetchUsgsFeed(url);
  const events = extractInScopeEvents(collection);
  console.log(
    `${events.length} in-scope SEA earthquake(s) out of ${collection.features?.length ?? 0} fetched.`,
  );

  const html = renderEventsPage(events, now);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, html, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

// Only run when invoked directly (`npm run fetch:usgs`), not when imported by tests.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("USGS feed fetch failed:", err);
    process.exitCode = 1;
  });
}
