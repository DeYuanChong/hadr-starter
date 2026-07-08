/**
 * Renders the situation-report dashboard: a self-contained HTML page with the
 * region map on top and the story detail below, in the ADR-0014 order
 * (header → feed health → since-yesterday → current stories by hazard, sorted
 * by triage severity). Also builds the machine-readable payload (story 16)
 * that is written alongside as dashboard-map.json.
 *
 * Scope is honest about itself: the "since yesterday" section and the
 * stateful story states render as an explicit "not yet" note rather than
 * being silently absent, because ADR-0006's whole point is that absence must
 * never be mistaken for "nothing changed".
 */

import { escapeHtml } from "../shared/html.js";
import { SEA_BOUNDING_BOX } from "../shared/sea-scope.js";
import { type AlertTier, type Feed, TIER_RANK } from "../shared/story.js";
import type { Story } from "../shared/story.js";
import { renderMap, TIER_COLOR } from "./map.js";

/** Per-feed reachability for this run (story 2 — feed health up front). */
export interface FeedHealth {
  feed: Feed;
  status: "live" | "fixture" | "unavailable";
  detail: string;
}

/** Human-friendly hazard labels; unknown codes shown raw (feeds/blindspots.md). */
const HAZARD_LABELS: Record<string, string> = {
  EQ: "Earthquake",
  TC: "Tropical cyclone",
  FL: "Flood",
  VO: "Volcano",
  DR: "Drought",
  WF: "Wildfire",
  OTHER: "Other",
};

function hazardLabel(code: string): string {
  const label = HAZARD_LABELS[code.toUpperCase()];
  return label ? `${label} (${code.toUpperCase()})` : code;
}

function tierPill(tier: AlertTier): string {
  return `<span class="pill" style="--pill:${TIER_COLOR[tier]}">${tier}</span>`;
}

function maxGroupTier(stories: Story[]): AlertTier {
  return stories.reduce<AlertTier>(
    (acc, s) => (TIER_RANK[s.triageSeverity] > TIER_RANK[acc] ? s.triageSeverity : acc),
    "none",
  );
}

/** Renders one story card. */
function renderStory(s: Story): string {
  const mag = s.mag !== null ? `M${s.mag.toFixed(1)} · ` : "";
  const countries = s.countries.length
    ? `<p class="s-countries">Affected: ${escapeHtml(s.countries.join(", "))}</p>`
    : "";
  const when = s.timeUtc ? `<p class="s-when">${escapeHtml(s.timeUtc)}</p>` : "";

  // Both raw alerts are always shown, even when they disagree (ADR-0007).
  const rawAlerts: string[] = [];
  if (s.gdacsAlert) rawAlerts.push(`GDACS ${escapeHtml(s.gdacsAlert)}`);
  if (s.pagerAlert) rawAlerts.push(`PAGER ${escapeHtml(s.pagerAlert)}`);
  const alertsLine = rawAlerts.length
    ? `<span class="s-raw">${rawAlerts.join(" · ")}</span>`
    : `<span class="s-raw s-muted">no alert value</span>`;

  const reconciledBadge = s.reconciled
    ? `<span class="badge badge-reconciled" title="Merged across feeds via the GDACS↔USGS earthquake join">reconciled ${s.sources
        .map((x) => x.feed)
        .join("+")}</span>`
    : "";

  const sources = s.sources
    .filter((x) => x.url)
    .map(
      (x) =>
        `<a href="${escapeHtml(x.url as string)}" target="_blank" rel="noopener noreferrer">${x.feed}</a>`,
    )
    .join(" · ");

  // Supplementary ReliefWeb: own-words title + attribution + link, zero
  // quoted body text (ADR-0015).
  const supplementary = s.supplementary.length
    ? `<ul class="s-supp">${s.supplementary
        .map(
          (l) =>
            `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              l.title,
            )}</a> <span class="via">via ReliefWeb</span></li>`,
        )
        .join("")}</ul>`
    : "";

  return `<article class="story" style="--tier:${TIER_COLOR[s.triageSeverity]}">
  <div class="s-head">
    ${tierPill(s.triageSeverity)}
    <h4>${escapeHtml(`${mag}${s.title}`)}</h4>
    ${reconciledBadge}
  </div>
  <p class="s-meta">${alertsLine}${sources ? ` <span class="s-src">${sources}</span>` : ""}</p>
  ${countries}
  ${when}
  ${supplementary}
</article>`;
}

/** Groups reported (non-suppressed) stories by hazard, sorts groups and
 * members by severity, and renders each group. Suppressed stories are
 * counted per hazard (story 6 — suppressed but disclosed, not vanished). */
function renderStoryGroups(stories: Story[]): string {
  const reported = stories.filter((s) => !s.suppressed);
  const suppressedByHazard = new Map<string, number>();
  for (const s of stories) {
    if (s.suppressed) {
      const k = s.hazardType.toUpperCase();
      suppressedByHazard.set(k, (suppressedByHazard.get(k) ?? 0) + 1);
    }
  }

  const byHazard = new Map<string, Story[]>();
  for (const s of reported) {
    const k = s.hazardType.toUpperCase();
    if (!byHazard.has(k)) byHazard.set(k, []);
    byHazard.get(k)!.push(s);
  }

  const groups = [...byHazard.entries()].sort(
    (a, b) => TIER_RANK[maxGroupTier(b[1])] - TIER_RANK[maxGroupTier(a[1])],
  );

  if (groups.length === 0) {
    const totalSuppressed = [...suppressedByHazard.values()].reduce((a, b) => a + b, 0);
    return `<p class="empty">No stories above Green-tier at time of fetch.${
      totalSuppressed ? ` ${totalSuppressed} Green-tier stor${totalSuppressed === 1 ? "y" : "ies"} suppressed (tracked, not shown).` : ""
    }</p>`;
  }

  return groups
    .map(([hazard, arr]) => {
      arr.sort((a, b) => {
        const t = TIER_RANK[b.triageSeverity] - TIER_RANK[a.triageSeverity];
        if (t !== 0) return t;
        return (b.timeUtc ?? "").localeCompare(a.timeUtc ?? "");
      });
      const suppressed = suppressedByHazard.get(hazard) ?? 0;
      const suppressedNote = suppressed
        ? ` <span class="suppressed-note">${suppressed} suppressed</span>`
        : "";
      return `<section class="hazard-group">
  <h3>${escapeHtml(hazardLabel(hazard))} <span class="count">${arr.length}</span>${suppressedNote}</h3>
  ${arr.map(renderStory).join("\n")}
</section>`;
    })
    .join("\n");
}

function renderHealthStrip(health: FeedHealth[]): string {
  const rows = health
    .map(
      (h) =>
        `<li class="health-${h.status}"><span class="feed">${escapeHtml(h.feed)}</span><span class="status">${escapeHtml(
          h.status,
        )}</span><span class="detail">${escapeHtml(h.detail)}</span></li>`,
    )
    .join("\n");
  return `<ul class="health-strip">${rows}</ul>
<p class="cadence">GDACS hazard cadence: Earthquake / Cyclone real-time · Wildfire / Volcano daily · Drought ~monthly · Flood human-curated. An absent hazard means "not due for update", not "no risk" (docs/adr/0017).</p>`;
}

/** The machine-readable payload written to dashboard-map.json (story 16). */
export function buildStructuredOutput(
  stories: Story[],
  health: FeedHealth[],
  generatedAt: Date,
): object {
  return {
    generatedAt: generatedAt.toISOString(),
    scope: {
      countries: "ASEAN-10 + Timor-Leste",
      boundingBox: SEA_BOUNDING_BOX,
    },
    feedHealth: health,
    stories: stories.map((s) => ({
      id: s.id,
      hazardType: s.hazardType,
      title: s.title,
      countries: s.countries,
      lat: s.lat,
      lon: s.lon,
      timeUtc: s.timeUtc,
      mag: s.mag,
      gdacsAlert: s.gdacsAlert,
      pagerAlert: s.pagerAlert,
      triageSeverity: s.triageSeverity,
      suppressed: s.suppressed,
      reconciled: s.reconciled,
      sources: s.sources,
      supplementary: s.supplementary,
    })),
  };
}

const STYLE = `
:root {
  --bg: #f4f6f4; --panel: #ffffff; --line: #d9ded8; --ink: #1b1e24;
  --ink-soft: #5a6470; --ink-faint: #8a94a0; --accent: #0e6f68;
  --panel-2: #eef1ee;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12171a; --panel: #182025; --line: #28323a; --ink: #e3e9e6;
    --ink-soft: #9aa8a2; --ink-faint: #64726c; --accent: #5fe0cf;
    --panel-2: #1d272c;
  }
}
:root[data-theme="dark"] {
  --bg: #12171a; --panel: #182025; --line: #28323a; --ink: #e3e9e6;
  --ink-soft: #9aa8a2; --ink-faint: #64726c; --accent: #5fe0cf; --panel-2: #1d272c;
}
:root[data-theme="light"] {
  --bg: #f4f6f4; --panel: #ffffff; --line: #d9ded8; --ink: #1b1e24;
  --ink-soft: #5a6470; --ink-faint: #8a94a0; --accent: #0e6f68; --panel-2: #eef1ee;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink); line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 2rem 1.25rem 5rem; }
header.top { border-bottom: 2px solid var(--accent); padding-bottom: 1rem; margin-bottom: 1.5rem; }
header.top h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
header.top .sub { color: var(--ink-soft); font-size: 0.9rem; margin: 0; }
h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); margin: 2rem 0 0.75rem; }
section.block { margin-bottom: 1.5rem; }
.health-strip { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.health-strip li { display: flex; align-items: baseline; gap: 0.6rem; padding: 0.6rem 0.8rem; background: var(--panel); border: 1px solid var(--line); border-left-width: 4px; border-radius: 5px; font-size: 0.88rem; }
.health-strip .feed { font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.04em; }
.health-strip .status { font-variant: small-caps; color: var(--ink-soft); }
.health-strip .detail { color: var(--ink-faint); font-size: 0.8rem; margin-left: auto; text-align: right; }
.health-live { border-left-color: #3f9d5a; }
.health-fixture { border-left-color: #e0b341; }
.health-unavailable { border-left-color: #d63b2f; }
.cadence { font-size: 0.8rem; color: var(--ink-faint); margin: 0.6rem 0 0; }
.deferred { background: var(--panel-2); border: 1px dashed var(--line); border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.86rem; color: var(--ink-soft); }
.deferred strong { color: var(--ink); }
figure.map { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 0.5rem; }
figure.map svg { width: 100%; height: auto; display: block; }
.land { fill: var(--panel-2); stroke: var(--ink-faint); stroke-width: 0.6; }
.bbox { fill: none; stroke: var(--accent); stroke-width: 1.2; stroke-dasharray: 6 5; opacity: 0.7; }
.markers circle { cursor: pointer; transition: r 0.1s; }
.markers circle:hover, .markers circle:focus { stroke: var(--accent); stroke-width: 2; outline: none; }
.map-legend { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; padding: 0.6rem 0.5rem 0.2rem; font-size: 0.8rem; color: var(--ink-soft); }
.legend-item { display: inline-flex; align-items: center; gap: 0.4rem; }
.swatch { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.25); }
.swatch-faint { background: #8a94a6; opacity: 0.35; }
.map-note { font-size: 0.8rem; color: var(--ink-faint); padding: 0 0.5rem; margin: 0.3rem 0 0; }
.hazard-group { margin-bottom: 1.25rem; }
.hazard-group h3 { font-size: 1rem; margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
.count { background: var(--panel-2); border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.78rem; color: var(--ink-soft); }
.suppressed-note { font-size: 0.75rem; color: var(--ink-faint); font-weight: 400; }
.story { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--tier); border-radius: 6px; padding: 0.7rem 0.9rem; margin-bottom: 0.6rem; }
.s-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.s-head h4 { margin: 0; font-size: 0.98rem; }
.pill { text-transform: uppercase; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; color: #fff; background: var(--pill); padding: 0.1rem 0.45rem; border-radius: 4px; }
.badge { font-size: 0.68rem; padding: 0.1rem 0.4rem; border-radius: 4px; border: 1px solid var(--line); color: var(--ink-soft); }
.badge-reconciled { border-color: var(--accent); color: var(--accent); }
.s-meta { margin: 0.35rem 0 0; font-size: 0.82rem; color: var(--ink-soft); }
.s-raw { font-variant-numeric: tabular-nums; }
.s-muted { color: var(--ink-faint); font-style: italic; }
.s-src a { margin-left: 0.3rem; }
.s-countries, .s-when { margin: 0.25rem 0 0; font-size: 0.82rem; color: var(--ink-soft); }
.s-when { color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.s-supp { margin: 0.4rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; }
.via { color: var(--ink-faint); font-size: 0.75rem; }
.empty { color: var(--ink-faint); font-style: italic; }
a { color: var(--accent); }
footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.78rem; color: var(--ink-faint); }
`;

/** Renders the full dashboard HTML document. */
export function renderDashboard(
  stories: Story[],
  health: FeedHealth[],
  generatedAt: Date,
): string {
  const reportedCount = stories.filter((s) => !s.suppressed).length;
  const suppressedCount = stories.length - reportedCount;
  const reconciledCount = stories.filter((s) => s.reconciled).length;
  const { minLon, maxLon, minLat, maxLat } = SEA_BOUNDING_BOX;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HADR Monitor — Southeast Asia Situation Report</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>HADR Monitor — Southeast Asia</h1>
    <p class="sub">Situation report · generated ${escapeHtml(generatedAt.toUTCString())} · scope: ASEAN-10 + Timor-Leste, box ${minLon}°E–${maxLon}°E ${Math.abs(
      minLat,
    )}°S–${maxLat}°N · ${reportedCount} reported / ${suppressedCount} suppressed / ${reconciledCount} reconciled</p>
  </header>

  <section class="block">
    <h2>Feed health</h2>
    ${renderHealthStrip(health)}
  </section>

  <section class="block">
    <h2>Since yesterday</h2>
    <div class="deferred"><strong>Not tracked in this build.</strong> Change detection (new / escalated / de-escalated / revised / deleted / confirmed, docs/adr/0005–0006) needs persisted prior state, which this snapshot dashboard does not keep. This section is shown empty-on-purpose rather than omitted, so its absence is never mistaken for "nothing changed" (docs/adr/0006).</div>
  </section>

  <section class="block">
    <h2>Monitored region</h2>
    ${renderMap(stories)}
  </section>

  <section class="block">
    <h2>Current stories</h2>
    ${renderStoryGroups(stories)}
  </section>

  <footer>
    Sensing layer only — watches, reconciles, reports; does not dispatch or decide response (REQS.md). Machine-readable data: dashboard-map.json. ReliefWeb content is own-words summary + link only (docs/adr/0015).
  </footer>
</div>
</body>
</html>
`;
}
