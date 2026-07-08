/**
 * Pure transform logic: raw RSS XML -> SEA-scoped ReliefWeb events.
 * Kept separate from the network call (adapter.ts) so it's testable against
 * fixture XML without ever touching the network, per the task's test brief.
 */

import { decodeEntities, parseRssItems, type RawRssItem } from "./xml.js";
import { seaIso3ForCountryName } from "./country-names.js";
import { isCountryInScope } from "../../shared/sea-scope.js";
import type { ReliefWebEvent } from "./types.js";

// Matches both "Affected country: X" and "Affected countries: X, Y" — see
// the two shapes in feeds/reliefweb.md and the live feed respectively.
const COUNTRY_TAG_RE = /<div class="tag country">\s*Affected countr(?:y|ies):\s*([^<]*)<\/div>/i;

/**
 * Extracts the affected-country name(s) from a (still HTML-entity-escaped)
 * description field. Returns [] rather than throwing on missing/malformed
 * input — the country tag is just one `<div>` among free-text HTML that
 * ReliefWeb doesn't guarantee is well-formed.
 */
export function extractCountryNames(descriptionHtml: string | null | undefined): string[] {
  if (!descriptionHtml) return [];
  let decoded: string;
  try {
    decoded = decodeEntities(descriptionHtml);
  } catch {
    return [];
  }
  const match = decoded.match(COUNTRY_TAG_RE);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True if any of the given country names resolve to an in-scope SEA ISO3. */
export function anyInSeaScope(countryNames: string[]): boolean {
  return countryNames.some((name) => {
    const iso3 = seaIso3ForCountryName(name);
    return iso3 !== null && isCountryInScope(iso3);
  });
}

function toEvent(raw: RawRssItem): ReliefWebEvent | null {
  // A title and a link are the minimum needed to show a usable row.
  if (!raw.title || !raw.link) return null;
  return {
    title: raw.title,
    countries: extractCountryNames(raw.description),
    pubDate: raw.pubDate,
    link: raw.link,
  };
}

/**
 * Parses raw ReliefWeb disasters RSS XML into the SEA-scoped event list
 * (docs/adr/0001-sea-country-list.md). Items with no affected-country match
 * in the SEA list are filtered out; items lacking a title/link are dropped
 * as unusable rather than crashing the run.
 */
export function parseSeaEvents(xml: string): ReliefWebEvent[] {
  return parseRssItems(xml)
    .map(toEvent)
    .filter((e): e is ReliefWebEvent => e !== null)
    .filter((e) => anyInSeaScope(e.countries));
}
