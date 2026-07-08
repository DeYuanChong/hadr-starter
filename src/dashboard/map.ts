/**
 * Self-contained SVG map of the monitored region (docs/adr/0002 bounding
 * box), with the SEA basemap drawn from embedded country outlines and event
 * markers plotted by lat/lon, sized and coloured by triage severity.
 *
 * No external requests, no tiles, no map library — the whole map is inline
 * SVG in the committed dashboard, matching the project's self-contained /
 * defensive ethos. An equirectangular projection is fine at this regional
 * scale and keeps lon/lat → x/y a single linear transform.
 */

import { SEA_BOUNDING_BOX } from "../shared/sea-scope.js";
import { SEA_GEOJSON } from "./sea-geojson.js";
import { escapeHtml } from "../shared/html.js";
import { type AlertTier, TIER_RANK } from "../shared/story.js";
import type { Story } from "../shared/story.js";

/** SVG canvas size (viewBox units). Width/height ratio roughly matches the
 * box's lon/lat span so land isn't distorted more than equirectangular
 * already implies. */
const WIDTH = 1000;
const HEIGHT = 900;

/** Padding (in degrees) added around the bounding box so coastlines right at
 * the edge — northern Myanmar, the Sunda arc — aren't clipped flush. */
const PAD = 1.5;

const VIEW = {
  minLon: SEA_BOUNDING_BOX.minLon - PAD,
  maxLon: SEA_BOUNDING_BOX.maxLon + PAD,
  minLat: SEA_BOUNDING_BOX.minLat - PAD,
  maxLat: SEA_BOUNDING_BOX.maxLat + PAD,
};

/** Fill colour per triage tier (marker + legend). Semantic, not the page
 * accent: green/orange/red are alert semantics; yellow is PAGER-only. */
export const TIER_COLOR: Record<AlertTier, string> = {
  none: "#8a94a6",
  green: "#3f9d5a",
  yellow: "#e0b341",
  orange: "#e0842b",
  red: "#d63b2f",
};

/** Projects [lon, lat] to [x, y] in SVG space (y inverted: north is up). */
export function project(lon: number, lat: number): [number, number] {
  const x = ((lon - VIEW.minLon) / (VIEW.maxLon - VIEW.minLon)) * WIDTH;
  const y = HEIGHT - ((lat - VIEW.minLat) / (VIEW.maxLat - VIEW.minLat)) * HEIGHT;
  return [x, y];
}

/** Marker radius grows with severity so red reads as bigger without relying
 * on colour alone (accessibility: severity is encoded twice). */
function markerRadius(tier: AlertTier): number {
  return 4 + TIER_RANK[tier] * 2.5;
}

function ringToPath(ring: number[][]): string {
  const pts = ring.map(([lon, lat]) => {
    const [x, y] = project(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

function geometryToPath(geometry: {
  type: string;
  coordinates: number[][][] | number[][][][];
}): string {
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as number[][][]).map(ringToPath).join(" ");
  }
  // MultiPolygon
  return (geometry.coordinates as number[][][][])
    .flatMap((poly) => poly.map(ringToPath))
    .join(" ");
}

/** Renders the country basemap layer as SVG path elements. Each in-scope
 * country is focusable and carries data-iso3 so the country-info panel
 * (render.ts) can wire click/keyboard selection to it. */
function renderBasemap(): string {
  return SEA_GEOJSON.features
    .map(
      (f) =>
        `<path class="land" d="${geometryToPath(f.geometry)}" data-iso3="${escapeHtml(
          f.properties.iso3,
        )}" tabindex="0" role="button" aria-label="${escapeHtml(
          f.properties.name,
        )} — show country details"><title>${escapeHtml(f.properties.name)}</title></path>`,
    )
    .join("\n");
}

/** Draws the ADR-0002 bounding box as a dashed rectangle for reference. */
function renderBoundingBox(): string {
  const [x1, y1] = project(SEA_BOUNDING_BOX.minLon, SEA_BOUNDING_BOX.maxLat);
  const [x2, y2] = project(SEA_BOUNDING_BOX.maxLon, SEA_BOUNDING_BOX.minLat);
  return `<rect class="bbox" x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${(x2 - x1).toFixed(
    1,
  )}" height="${(y2 - y1).toFixed(1)}"></rect>`;
}

/** A story is mappable only if it carries a coordinate (ReliefWeb items don't). */
export function isMappable(story: Story): boolean {
  return story.lat !== null && story.lon !== null;
}

/**
 * Renders one event marker. Suppressed (Green-tier) stories still appear on
 * the map — the map is context, and hiding them would misrepresent the
 * region's activity — but drawn faint and small so they don't compete with
 * live signal. Each marker carries a data-story-id and an SVG <title> for
 * hover, and is a link when a source url exists.
 */
function renderMarker(story: Story): string {
  const [x, y] = project(story.lon as number, story.lat as number);
  const r = markerRadius(story.triageSeverity);
  const color = TIER_COLOR[story.triageSeverity];
  const opacity = story.suppressed ? 0.35 : 0.9;
  const magLabel = story.mag !== null ? ` M${story.mag.toFixed(1)}` : "";
  const tip = `${story.hazardType}${magLabel} — ${story.title}${
    story.countries.length ? ` (${story.countries.join(", ")})` : ""
  } · triage ${story.triageSeverity}`;
  const circle =
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" ` +
    `fill="${color}" fill-opacity="${opacity}" stroke="#1b1e24" stroke-width="0.75" ` +
    `data-story-id="${escapeHtml(story.id)}" tabindex="0">` +
    `<title>${escapeHtml(tip)}</title></circle>`;
  const href = story.sources.find((s) => s.url)?.url ?? null;
  return href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${circle}</a>`
    : circle;
}

/** Legend swatches for the tiers actually present, plus the suppressed hint. */
function renderLegend(tiersPresent: Set<AlertTier>): string {
  const order: AlertTier[] = ["red", "orange", "yellow", "green", "none"];
  const label: Record<AlertTier, string> = {
    red: "Red",
    orange: "Orange",
    yellow: "Yellow (PAGER)",
    green: "Green",
    none: "No alert",
  };
  const items = order
    .filter((t) => tiersPresent.has(t))
    .map(
      (t) =>
        `<span class="legend-item"><span class="swatch" style="background:${TIER_COLOR[t]}"></span>${label[t]}</span>`,
    )
    .join("");
  return `<div class="map-legend">${items}<span class="legend-item legend-suppressed"><span class="swatch swatch-faint"></span>faint = suppressed (Green-tier)</span></div>`;
}

/**
 * Renders the full map block: the inline SVG (basemap + bbox + markers) and a
 * legend. Markers are drawn severity-ascending so red sits on top of green.
 */
export function renderMap(stories: Story[]): string {
  const mappable = stories
    .filter(isMappable)
    .slice()
    .sort((a, b) => TIER_RANK[a.triageSeverity] - TIER_RANK[b.triageSeverity]);

  const tiersPresent = new Set<AlertTier>(mappable.map((s) => s.triageSeverity));
  const markers = mappable.map(renderMarker).join("\n");
  const unmapped = stories.length - mappable.length;

  const unmappedNote =
    unmapped > 0
      ? `<p class="map-note">${unmapped} country-level item${
          unmapped === 1 ? "" : "s"
        } (no coordinate — e.g. ReliefWeb) not shown on the map; see the stories below.</p>`
      : "";

  return `<figure class="map">
<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Map of Southeast Asia showing monitored disaster events by severity" preserveAspectRatio="xMidYMid meet">
  <g class="basemap">
${renderBasemap()}
  </g>
  ${renderBoundingBox()}
  <g class="markers">
${markers}
  </g>
</svg>
${renderLegend(tiersPresent)}
${unmappedNote}
</figure>`;
}
