/**
 * GDACS feed fetcher.
 *
 * Scope for this module, per the task it was built against: fetch the live
 * GDACS event list, filter to Southeast Asia (docs/adr/0001,
 * docs/adr/0002), and render a table of the resulting records to
 * `events/gdacs.html`. No cross-feed reconciliation into a CONTEXT.md
 * "Story", no triage severity, no state machine, no persistence between
 * runs — those are later, full-dashboard concerns (docs/adr/0004 through
 * 0017). What this file produces is GDACS "records" (CONTEXT.md: "record"
 * for a single feed's raw item), not stories.
 *
 * See feeds/gdacs.md for the endpoint and an example response, and
 * feeds/blindspots.md ("GDACS is six pipelines wearing one schema", "GDACS
 * is the flaky one") for the operational gotchas this file defends against.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isCountryInScope } from "../../shared/sea-scope";
import { escapeHtml, renderPage } from "../../shared/html";

export const GDACS_EVENT_LIST_URL =
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP";

/**
 * GDACS has no documented uptime guarantee and is reported to hang for
 * 100+ seconds some mornings (feeds/blindspots.md). We don't do
 * retry/backoff here (that's scheduling infrastructure, see
 * docs/adr/0010) — just a bound so a bad morning fails one run loudly
 * instead of hanging indefinitely.
 */
const FETCH_TIMEOUT_MS = 15_000;

const PAGE_TITLE = "GDACS Events — Southeast Asia";

/** Where the rendered page is written, resolved relative to this file so it
 * doesn't depend on the working directory `npm run fetch:gdacs` is invoked
 * from. */
const EVENTS_PAGE_URL = new URL("../../../events/gdacs.html", import.meta.url);

/**
 * A single normalised GDACS record, extracted defensively from one GeoJSON
 * feature in the live event list. This is deliberately *not* a full
 * CONTEXT.md "Story" — no reconciliation with USGS/ReliefWeb happens here.
 */
export interface GdacsRecord {
  eventId: string;
  name: string;
  /** Raw GDACS hazard code (`EQ`, `TC`, `FL`, `VO`, `DR`, `WF`, ...). Shown
   * as-is rather than mapped to a label, since GDACS may add hazard types
   * without notice (feeds/blindspots.md, "moving targets") and an unmapped
   * code is more honest than a guessed label. */
  hazardType: string;
  /**
   * Raw country string as GDACS reports it. For multi-country events (a
   * cyclone tracking across several countries, or a cross-border wildfire)
   * this is a single comma-separated string naming all of them. Shown in
   * full, unclipped, per docs/adr/0003: scope decides *whether* a record is
   * included, not what parts of it are shown.
   */
  country: string;
  alertLevel: string;
  fromDate: string;
  reportUrl: string | null;
  /**
   * Every ISO3 code found for this record, deduplicated. GDACS's top-level
   * `iso3` property has only ever been observed as a single code — even for
   * a genuinely multi-country event (e.g. a cyclone naming five countries in
   * `country`, `iso3` still names just one of them). `affectedcountries` is
   * the closer-to-complete structured list, but has also been observed
   * under-listing countries that appear in the `country` string (e.g. a
   * two-country wildfire whose `affectedcountries` array names only one).
   * Neither field is fully trustworthy alone, so we collect codes from both
   * rather than picking one, to avoid silently dropping an in-scope country
   * GDACS's own `iso3` field missed.
   */
  iso3Codes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Splits the top-level `iso3` property on commas defensively. In every live
 * response inspected this has been a single code (or an empty string), but
 * blindspots.md's warning that "country/iso3 fields aren't always a clean
 * single value" is about the schema in general, not a guarantee about this
 * one field's current behaviour — so we don't assume it can never change.
 */
function splitIso3Field(value: unknown): string[] {
  const str = asNonEmptyString(value);
  if (!str) return [];
  return str
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0);
}

/** Reads ISO3 codes out of the `affectedcountries` array, if present and
 * well-formed. Tolerates missing/malformed entries rather than throwing. */
function extractAffectedCountryCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const codes: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const code = asNonEmptyString(entry.iso3);
    if (code) codes.push(code.trim().toUpperCase());
  }
  return codes;
}

/**
 * Extracts one normalised GdacsRecord from a raw GeoJSON feature, per the
 * project's defensive-parsing principle (feeds/blindspots.md #9: "unknown
 * fields tolerated, schema drift logged rather than crashed on"). Returns
 * null — logging a warning rather than throwing — only when the feature is
 * too malformed to have anything worth extracting (not an object, or no
 * `properties` object at all). Individual missing fields on an otherwise
 * usable feature fall back to honest placeholders instead of dropping the
 * whole record, since a real event with one missing field is still
 * humanitarian signal worth keeping.
 */
export function extractGdacsRecord(feature: unknown): GdacsRecord | null {
  if (!isRecord(feature)) {
    console.warn("[gdacs] Skipping malformed feature: not an object");
    return null;
  }

  const props = feature.properties;
  if (!isRecord(props)) {
    console.warn("[gdacs] Skipping feature with missing/invalid properties");
    return null;
  }

  const eventIdRaw = props.eventid;
  const eventId =
    typeof eventIdRaw === "number" || typeof eventIdRaw === "string"
      ? String(eventIdRaw)
      : "unknown";

  const name =
    asNonEmptyString(props.name) ??
    asNonEmptyString(props.description) ??
    "(untitled GDACS event)";
  const hazardType = asNonEmptyString(props.eventtype) ?? "UNKNOWN";
  const country = asNonEmptyString(props.country) ?? "Unknown";
  const alertLevel = asNonEmptyString(props.alertlevel) ?? "Unknown";
  const fromDate = asNonEmptyString(props.fromdate) ?? "Unknown";

  let reportUrl: string | null = null;
  if (isRecord(props.url)) {
    reportUrl = asNonEmptyString(props.url.report);
  }

  const iso3Codes = Array.from(
    new Set([
      ...splitIso3Field(props.iso3),
      ...extractAffectedCountryCodes(props.affectedcountries),
    ]),
  );

  if (eventIdRaw !== undefined && eventId === "unknown") {
    console.warn(`[gdacs] Record "${name}" has a non-standard eventid; continuing without it`);
  }

  return { eventId, name, hazardType, country, alertLevel, fromDate, reportUrl, iso3Codes };
}

/**
 * Parses the raw GDACS event-list response into normalised records,
 * skipping (and logging) anything malformed rather than crashing the whole
 * run over one bad feature.
 */
export function parseGdacsEventList(raw: unknown): GdacsRecord[] {
  if (!isRecord(raw) || !Array.isArray(raw.features)) {
    console.warn(
      "[gdacs] Unexpected GDACS response shape (expected a FeatureCollection with a features array); treating as zero events",
    );
    return [];
  }

  const records: GdacsRecord[] = [];
  for (const feature of raw.features) {
    const record = extractGdacsRecord(feature);
    if (record) records.push(record);
  }
  return records;
}

/** True if any ISO3 code found on the record is in Southeast Asia scope. */
export function isRecordInScope(record: GdacsRecord): boolean {
  return record.iso3Codes.some((code) => isCountryInScope(code));
}

/** Filters records down to Southeast Asia scope only. */
export function filterInScopeRecords(records: GdacsRecord[]): GdacsRecord[] {
  return records.filter(isRecordInScope);
}

/** Renders the SEA-filtered GDACS records as a basic HTML events page. */
export function renderGdacsEventsPage(records: GdacsRecord[], fetchedAt: Date): string {
  const meta = `<p class="meta">Southeast Asia scope: ASEAN-10 + Timor-Leste (docs/adr/0001). Fetched ${escapeHtml(
    fetchedAt.toISOString(),
  )} from GDACS's live event list.</p>`;

  if (records.length === 0) {
    const body = `
<h1>${escapeHtml(PAGE_TITLE)}</h1>
${meta}
<p class="empty">No in-scope GDACS events at time of fetch.</p>
`;
    return renderPage(PAGE_TITLE, body);
  }

  const rows = records
    .map(
      (r) => `    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.hazardType)}</td>
      <td>${escapeHtml(r.country)}</td>
      <td>${escapeHtml(r.alertLevel)}</td>
      <td>${escapeHtml(r.fromDate)}</td>
      <td>${r.reportUrl ? `<a href="${escapeHtml(r.reportUrl)}">source</a>` : "—"}</td>
    </tr>`,
    )
    .join("\n");

  const body = `
<h1>${escapeHtml(PAGE_TITLE)}</h1>
${meta}
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Hazard</th>
      <th>Country</th>
      <th>Alert level</th>
      <th>From date</th>
      <th>Source</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
`;

  return renderPage(PAGE_TITLE, body);
}

/** Fetches the live GDACS event list. Throws on timeout, network error, or
 * a non-2xx response — callers are expected to fail loudly rather than
 * retry (no retry/backoff infrastructure here; see docs/adr/0010). */
export async function fetchGdacsEventList(): Promise<unknown> {
  const response = await fetch(GDACS_EVENT_LIST_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GDACS responded with HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main(): Promise<void> {
  let raw: unknown;
  try {
    raw = await fetchGdacsEventList();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[gdacs] Failed to fetch the GDACS event list from ${GDACS_EVENT_LIST_URL}: ${message}`);
    console.error(
      "[gdacs] GDACS is documented as flaky (NULL-byte responses, 100+s hangs some mornings — see feeds/blindspots.md). Not writing events/gdacs.html this run; leaving any previously committed page in place.",
    );
    process.exitCode = 1;
    return;
  }

  const allRecords = parseGdacsEventList(raw);
  const inScopeRecords = filterInScopeRecords(allRecords);
  const html = renderGdacsEventsPage(inScopeRecords, new Date());

  await writeFile(EVENTS_PAGE_URL, html, "utf8");
  console.log(
    `[gdacs] Fetched ${allRecords.length} GDACS record(s); ${inScopeRecords.length} in Southeast Asia scope. Wrote events/gdacs.html.`,
  );
}

const isMainModule = process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
