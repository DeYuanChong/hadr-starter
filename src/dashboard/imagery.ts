/**
 * Satellite imagery for alerted areas, from NASA GIBS via the Worldview
 * Snapshots API (docs/adr/0018).
 *
 * One event-date, bbox-centred VIIRS true-colour JPEG per reported story,
 * fetched at build time and embedded as a data URI — the page stays
 * self-contained (no view-time requests), mirroring how flags and Wikipedia
 * summaries are handled. Each image links to NASA Worldview's interactive
 * viewer for time-slider / zoom exploration.
 *
 * Honesty constraints (rendered into the caption, not just documented):
 * - VIIRS is 375 m: regional context — smoke plumes, cyclone structure,
 *   major flooding. It can NOT show building-level damage.
 * - Southeast Asia is monsoon country: clouds routinely obscure the surface.
 * - Imagery is public domain (NASA); attribution is still given.
 *
 * Imagery is an enhancement, never signal: any fetch failure just means the
 * story renders without an image. No fixture fallback — a stale or wrong
 * image is worse than none.
 */

import { TIER_RANK } from "../shared/story.js";
import type { Story } from "../shared/story.js";
import { parseUtcish } from "./state.js";

const SNAPSHOT_URL = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";
const WORLDVIEW_URL = "https://worldview.earthdata.nasa.gov/";
const LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor";
const IMAGE_SIZE = 512;
const FETCH_TIMEOUT_MS = 20_000;

/** Page-weight bound: at ~40KB per embedded JPEG, 8 images ≈ +320KB max. */
export const MAX_IMAGES = 8;

/** A JPEG smaller than this is almost certainly a blank/black frame (e.g.
 * a date GIBS hasn't processed yet), not a real scene. */
const MIN_PLAUSIBLE_BYTES = 5_000;

export interface BBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface StoryImagery {
  storyId: string;
  /** Embedded JPEG (data URI). */
  dataUri: string;
  /** Acquisition date shown to the reader (YYYY-MM-DD, UTC). */
  imageDate: string;
  /** Deep link into NASA Worldview, centred on the same area and date. */
  worldviewUrl: string;
  layer: string;
}

/** Imagery metadata for dashboard-map.json — everything except the data URI
 * (which would bloat the JSON payload for no downstream value; agents can
 * follow worldviewUrl or re-fetch GIBS themselves). */
export type StoryImageryMeta = Omit<StoryImagery, "dataUri">;

/**
 * The area to image, centred on the story's coordinate. Half-size scales
 * with hazard footprint: cyclones and droughts are synoptic-scale systems,
 * everything else gets a ~165 km regional box.
 */
/** Rounds to 4 decimals (~11 m) so bbox arithmetic doesn't leak binary
 * floating-point residue into request URLs. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function bboxForStory(story: Story): BBox | null {
  if (story.lat === null || story.lon === null) return null;
  const hazard = story.hazardType.toUpperCase();
  const half = hazard === "TC" || hazard === "DR" ? 3 : 0.75;
  return {
    latMin: round4(Math.max(-90, story.lat - half)),
    latMax: round4(Math.min(90, story.lat + half)),
    lonMin: round4(Math.max(-180, story.lon - half)),
    lonMax: round4(Math.min(180, story.lon + half)),
  };
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The date to request. The event date when it's already a completed UTC day;
 * otherwise yesterday — GIBS's daily near-real-time composites for "today"
 * are usually incomplete at 08:30 SGT (00:30 UTC).
 */
export function imageDateForStory(story: Story, now: Date): string {
  const yesterdayMs = now.getTime() - 24 * 60 * 60 * 1000;
  const eventMs = parseUtcish(story.timeUtc);
  return toDateString(eventMs === null ? yesterdayMs : Math.min(eventMs, yesterdayMs));
}

/** Steps a YYYY-MM-DD date string back one day (UTC). */
export function dayBefore(date: string): string {
  return toDateString(Date.parse(`${date}T00:00:00Z`) - 24 * 60 * 60 * 1000);
}

/** Worldview Snapshots API request URL. BBOX order is latMin,lonMin,latMax,lonMax. */
export function snapshotUrl(bbox: BBox, date: string): string {
  const params = new URLSearchParams({
    REQUEST: "GetSnapshot",
    TIME: date,
    BBOX: `${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`,
    CRS: "EPSG:4326",
    LAYERS: LAYER,
    FORMAT: "image/jpeg",
    WIDTH: String(IMAGE_SIZE),
    HEIGHT: String(IMAGE_SIZE),
  });
  return `${SNAPSHOT_URL}?${params.toString()}`;
}

/** Worldview interactive viewer deep link. Its `v` viewport is lon-first. */
export function worldviewUrl(bbox: BBox, date: string): string {
  const v = `${bbox.lonMin},${bbox.latMin},${bbox.lonMax},${bbox.latMax}`;
  return `${WORLDVIEW_URL}?v=${v}&t=${date}`;
}

/**
 * Which stories get imagery: reported (docs/adr/0008 — suppressed noise gets
 * no page weight), mappable (a coordinate to centre on), most severe first,
 * capped at MAX_IMAGES.
 */
export function pickImageryTargets(stories: Story[]): Story[] {
  return stories
    .filter((s) => !s.suppressed && s.lat !== null && s.lon !== null)
    .sort((a, b) => TIER_RANK[b.triageSeverity] - TIER_RANK[a.triageSeverity])
    .slice(0, MAX_IMAGES);
}

async function fetchSnapshot(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("image/jpeg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= MIN_PLAUSIBLE_BYTES ? buf : null;
  } catch {
    return null;
  }
}

/** Fetches imagery for one story: the chosen date, falling back one day if
 * the composite isn't there yet. Null on any failure — the story simply
 * renders without an image. */
async function fetchOne(story: Story, now: Date): Promise<StoryImagery | null> {
  const bbox = bboxForStory(story);
  if (!bbox) return null;

  let date = imageDateForStory(story, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const buf = await fetchSnapshot(snapshotUrl(bbox, date));
    if (buf) {
      return {
        storyId: story.id,
        dataUri: `data:image/jpeg;base64,${buf.toString("base64")}`,
        imageDate: date,
        worldviewUrl: worldviewUrl(bbox, date),
        layer: LAYER,
      };
    }
    date = dayBefore(date);
  }
  console.warn(`[imagery] No usable GIBS snapshot for "${story.title}" (${story.id}); story renders without imagery.`);
  return null;
}

/** Fetches imagery for all eligible stories in parallel, keyed by story id. */
export async function fetchImagery(
  stories: Story[],
  now: Date,
): Promise<Map<string, StoryImagery>> {
  const targets = pickImageryTargets(stories);
  const results = await Promise.all(targets.map((s) => fetchOne(s, now)));
  const map = new Map<string, StoryImagery>();
  for (const r of results) {
    if (r) map.set(r.storyId, r);
  }
  return map;
}
