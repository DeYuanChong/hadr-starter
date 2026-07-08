/**
 * Renders the ReliefWeb SEA events page. Pure function of (events, meta) so
 * it's testable without a network call or filesystem write.
 */

import { renderPage, escapeHtml } from "../../shared/html.js";
import type { ReliefWebEvent, ReliefWebSourceStatus } from "./types.js";

export interface RenderMeta {
  status: ReliefWebSourceStatus;
  fetchedAt: Date;
  /** Populated when status is "fixture" or "unavailable". */
  reason?: string;
}

function formatTimestamp(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function statusBanner(meta: RenderMeta): string {
  const when = escapeHtml(formatTimestamp(meta.fetchedAt));
  const reason = escapeHtml(meta.reason ?? "unknown error");
  if (meta.status === "live") {
    return `<p class="meta">Live ReliefWeb RSS fetched ${when}.</p>`;
  }
  if (meta.status === "fixture") {
    return `<p class="meta"><strong>Live ReliefWeb RSS unreachable as of ${when} (${reason}); showing fixture data for demonstration only — not live disasters.</strong></p>`;
  }
  return `<p class="meta"><strong>ReliefWeb: unavailable as of ${when} (${reason}).</strong></p>`;
}

function eventsTable(events: ReliefWebEvent[]): string {
  if (events.length === 0) {
    return `<p class="empty">No Southeast Asia disasters currently in scope on ReliefWeb.
      This is expected, not an error — ReliefWeb publishes only ~90&ndash;115
      disaster pages a year worldwide (see feeds/blindspots.md), so a
      SEA-filtered pull returning zero items on any given run is normal,
      especially over a weekend (no ReliefWeb editorial coverage since
      Jul 2025).</p>`;
  }
  const rows = events
    .map(
      (e) => `      <tr>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(e.countries.join(", ") || "unknown")}</td>
        <td>${escapeHtml(e.pubDate ?? "unknown")}</td>
        <td><a href="${escapeHtml(e.link)}" rel="noopener noreferrer">source</a></td>
      </tr>`
    )
    .join("\n");
  return `<table>
    <thead>
      <tr><th>Disaster</th><th>Affected country</th><th>Published</th><th>Link</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

/**
 * Builds the full "ReliefWeb Disasters — Southeast Asia" page. Per
 * docs/adr/0015, only title/country/date/link are shown — no ReliefWeb
 * description body text is reproduced.
 */
export function renderReliefWebPage(events: ReliefWebEvent[], meta: RenderMeta): string {
  const body = `<h1>ReliefWeb Disasters — Southeast Asia</h1>
  ${statusBanner(meta)}
  <p class="meta">${events.length} item(s) in scope. Title, country, publish date, and
  link only — no ReliefWeb description text is reproduced here (docs/adr/0015-zero-reliefweb-quotes.md).</p>
  ${eventsTable(events)}`;
  return renderPage("ReliefWeb Disasters — Southeast Asia", body);
}
