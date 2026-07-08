/**
 * Collect layer: fetches all three feeds, resolves the earthquake-join
 * inputs, and reports per-feed health. This is the only networked part of the
 * dashboard; reconcile.ts and render.ts are pure over what this returns.
 *
 * Feeds are isolated from each other (story 17): each is fetched in its own
 * try/catch, and one feed failing degrades the report for that feed only
 * (its health goes to unavailable/fixture) rather than aborting the run —
 * the 08:30 report must still publish on a bad morning (REQS.md item 5).
 */

import {
  fetchGdacsEventList,
  parseGdacsEventList,
  filterInScopeRecords,
} from "../feeds/gdacs/index.js";
import {
  buildQueryUrl,
  computeQueryStart,
  extractInScopeEvents,
  fetchUsgsFeed,
  type UsgsFeatureCollection,
} from "../feeds/usgs/index.js";
import { fetchLiveRss } from "../feeds/reliefweb/adapter.js";
import { FIXTURE_RSS_XML } from "../feeds/reliefweb/fixture.js";
import { parseSeaEvents } from "../feeds/reliefweb/transform.js";
import type { FeedHealth } from "./render.js";
import type { GdacsInput, ReliefWebInput, UsgsInput } from "./reconcile.js";
import type { Feed } from "../shared/story.js";

const DETAIL_TIMEOUT_MS = 15_000;

export interface CollectOptions {
  /** Last successful USGS poll (docs/adr/0011): when older than the default
   * lookback, the query window extends back to it so nothing that changed
   * during the gap is silently skipped. */
  usgsExtendBackTo?: Date;
}

export interface Collected {
  gdacs: GdacsInput[];
  usgs: UsgsInput[];
  reliefweb: ReliefWebInput[];
  health: FeedHealth[];
  /** Start of the USGS query window actually used this run (epoch ms) — the
   * state machine needs it to tell "aged out of the window" from "deleted". */
  usgsWindowStartMs: number;
  /** Per-feed version watermarks observed this run (GDACS max datemodified,
   * USGS max updated), recorded in the cursor per docs/adr/0011. */
  watermarks: Partial<Record<Feed, string | null>>;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Walks the raw GDACS event list to recover per-event coordinates and the
 * geteventdata detail URL — data the feed module's GdacsRecord drops but the
 * map (coordinates) and the EQ join (detail URL → sourceid) both need.
 * Keyed by stringified eventid so it can be joined back to the records.
 */
interface GdacsGeomEntry {
  lat: number | null;
  lon: number | null;
  detailUrl: string | null;
  glide: string | null;
  dateModified: string | null;
}

function indexGdacsGeometry(raw: unknown): Map<string, GdacsGeomEntry> {
  const index = new Map<string, GdacsGeomEntry>();
  if (!isObj(raw) || !Array.isArray(raw.features)) return index;
  for (const f of raw.features) {
    if (!isObj(f)) continue;
    const props = isObj(f.properties) ? f.properties : {};
    const eventId =
      typeof props.eventid === "number" || typeof props.eventid === "string"
        ? String(props.eventid)
        : null;
    if (!eventId) continue;

    let lat: number | null = null;
    let lon: number | null = null;
    const geom = isObj(f.geometry) ? f.geometry : null;
    const coords = geom && Array.isArray(geom.coordinates) ? geom.coordinates : null;
    if (coords && typeof coords[0] === "number" && typeof coords[1] === "number") {
      lon = coords[0];
      lat = coords[1];
    }

    let detailUrl: string | null = null;
    if (isObj(props.url) && typeof props.url.details === "string") {
      detailUrl = props.url.details;
    }
    const glide =
      typeof props.glide === "string" && props.glide.trim().length > 0
        ? props.glide.trim()
        : null;
    const dateModified =
      typeof props.datemodified === "string" && props.datemodified.trim().length > 0
        ? props.datemodified.trim()
        : null;
    index.set(eventId, { lat, lon, detailUrl, glide, dateModified });
  }
  return index;
}

/** Fetches a GDACS geteventdata detail and returns its `sourceid`, or null on
 * any failure (GDACS is flaky — a failed detail just means no join for that
 * event, never a crashed run). */
async function fetchSourceId(detailUrl: string): Promise<string | null> {
  try {
    const res = await fetch(detailUrl, { signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const props = isObj(data) && isObj(data.properties) ? data.properties : null;
    const sourceId = props && typeof props.sourceid === "string" ? props.sourceid.trim() : "";
    return sourceId.length > 0 ? sourceId : null;
  } catch {
    return null;
  }
}

/** Parses the `ids` field (",id1,id2,") into a clean list. */
function parseIds(ids: unknown): string[] {
  if (typeof ids !== "string") return [];
  return ids
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Builds a map from each USGS event id to its full ids list, from the raw
 * collection (the feed module's EarthquakeEvent drops `ids`). */
function indexUsgsIds(collection: UsgsFeatureCollection): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of collection.features ?? []) {
    if (f && typeof f.id === "string") {
      map.set(f.id, parseIds(f.properties?.ids));
    }
  }
  return map;
}

async function collectGdacs(
  health: FeedHealth[],
  watermarks: Partial<Record<Feed, string | null>>,
): Promise<GdacsInput[]> {
  let raw: unknown;
  try {
    raw = await fetchGdacsEventList();
  } catch (err) {
    health.push({
      feed: "gdacs",
      status: "unavailable",
      detail: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return [];
  }

  const records = filterInScopeRecords(parseGdacsEventList(raw));
  const geo = indexGdacsGeometry(raw);

  // GDACS's own version cursor is datemodified (docs/adr/0011); record the
  // max observed as this run's watermark.
  let watermark: string | null = null;
  for (const entry of geo.values()) {
    if (entry.dateModified && (!watermark || entry.dateModified > watermark)) {
      watermark = entry.dateModified;
    }
  }
  watermarks.gdacs = watermark;

  // Resolve sourceids for in-scope earthquakes only (bounded work), in
  // parallel. A failed detail fetch just leaves sourceId null (no join).
  const inputs = await Promise.all(
    records.map(async (r): Promise<GdacsInput> => {
      const g: GdacsGeomEntry =
        geo.get(r.eventId) ??
        { lat: null, lon: null, detailUrl: null, glide: null, dateModified: null };
      let sourceId: string | null = null;
      if (r.hazardType.toUpperCase() === "EQ" && g.detailUrl) {
        sourceId = await fetchSourceId(g.detailUrl);
      }
      return {
        eventId: r.eventId,
        name: r.name,
        hazardType: r.hazardType,
        country: r.country,
        alertLevel: r.alertLevel,
        fromDate: r.fromDate,
        reportUrl: r.reportUrl,
        lat: g.lat,
        lon: g.lon,
        sourceId,
        glide: g.glide,
      };
    }),
  );

  health.push({
    feed: "gdacs",
    status: "live",
    detail: `${inputs.length} in-scope record(s)`,
  });
  return inputs;
}

async function collectUsgs(
  health: FeedHealth[],
  watermarks: Partial<Record<Feed, string | null>>,
  now: Date,
  extendBackTo?: Date,
): Promise<UsgsInput[]> {
  let collection: UsgsFeatureCollection;
  try {
    collection = await fetchUsgsFeed(buildQueryUrl(now, extendBackTo));
  } catch (err) {
    health.push({
      feed: "usgs",
      status: "unavailable",
      detail: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return [];
  }

  // USGS's version cursor is `updated` (docs/adr/0011); record the max
  // observed (as an ISO string) as this run's watermark.
  let maxUpdated = 0;
  for (const f of collection.features ?? []) {
    const u = f?.properties?.updated;
    if (typeof u === "number" && u > maxUpdated) maxUpdated = u;
  }
  watermarks.usgs = maxUpdated > 0 ? new Date(maxUpdated).toISOString() : null;

  const events = extractInScopeEvents(collection);
  const idsById = indexUsgsIds(collection);
  const inputs: UsgsInput[] = events.map((e) => ({
    id: e.id,
    ids: idsById.get(e.id) ?? [e.id],
    mag: e.mag,
    place: e.place,
    lat: e.lat,
    lon: e.lon,
    timeUtc: e.timeUtc,
    alert: e.alert,
    url: e.url,
  }));

  health.push({ feed: "usgs", status: "live", detail: `${inputs.length} in-scope event(s)` });
  return inputs;
}

async function collectReliefWeb(health: FeedHealth[]): Promise<ReliefWebInput[]> {
  const live = await fetchLiveRss();
  let xml: string;
  let status: FeedHealth["status"];
  let detail: string;

  if (live.ok && live.xml) {
    xml = live.xml;
    status = "live";
    detail = "live RSS";
  } else {
    xml = FIXTURE_RSS_XML;
    status = "fixture";
    detail = `live unavailable (${live.reason ?? "unknown"}); fixture`;
  }

  let events: ReliefWebInput[] = [];
  try {
    events = parseSeaEvents(xml).map((e) => ({
      title: e.title,
      countries: e.countries,
      link: e.link,
    }));
  } catch (err) {
    status = "unavailable";
    detail = `parse failed: ${err instanceof Error ? err.message : String(err)}`;
    events = [];
  }

  health.push({ feed: "reliefweb", status, detail });
  return events;
}

/** Fetches all three feeds concurrently, isolated from one another. */
export async function collect(options: CollectOptions = {}): Promise<Collected> {
  const health: FeedHealth[] = [];
  const watermarks: Partial<Record<Feed, string | null>> = {};
  const now = new Date();
  const [gdacs, usgs, reliefweb] = await Promise.all([
    collectGdacs(health, watermarks),
    collectUsgs(health, watermarks, now, options.usgsExtendBackTo),
    collectReliefWeb(health),
  ]);
  // Keep a stable feed order in the health strip regardless of resolution order.
  const order: Record<string, number> = { gdacs: 0, usgs: 1, reliefweb: 2 };
  health.sort((a, b) => order[a.feed] - order[b.feed]);
  return {
    gdacs,
    usgs,
    reliefweb,
    health,
    usgsWindowStartMs: computeQueryStart(now, options.usgsExtendBackTo).getTime(),
    watermarks,
  };
}
