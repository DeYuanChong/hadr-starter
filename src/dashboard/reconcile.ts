/**
 * Reconciliation: fold the three feeds' records into CONTEXT.md "Stories".
 *
 * The earthquake join is the solved one (feeds/blindspots.md): a GDACS EQ
 * record's `sourceid` (from its geteventdata detail) is a USGS event id;
 * match it against the USGS event's `ids` *list*, not the single preferred
 * id. Matched records merge into one reconciled Story. All other GDACS and
 * USGS records stand alone. ReliefWeb items attach as supplementary links to
 * a loosely-matching non-EQ story, or list on their own — never merged, never
 * affecting severity (docs/adr/0004, docs/adr/0015).
 *
 * This is a pure function over already-fetched inputs, so it is testable
 * without the network.
 */

import { assignTriage } from "./triage.js";
import type { Story } from "../shared/story.js";

/** A GDACS record enriched with coordinates and (for EQ) its resolved USGS
 * source id. Assembled by collect.ts from the event list + detail endpoint. */
export interface GdacsInput {
  eventId: string;
  name: string;
  hazardType: string;
  /** Full comma-separated country string as GDACS reported it. */
  country: string;
  alertLevel: string;
  fromDate: string;
  reportUrl: string | null;
  lat: number | null;
  lon: number | null;
  /** USGS event id from the GDACS detail endpoint (EQ + source NEIC), else
   * null — either not an earthquake, or the detail fetch failed/was empty. */
  sourceId: string | null;
}

/** A USGS event plus its full `ids` list (the join target). */
export interface UsgsInput {
  id: string;
  ids: string[];
  mag: number | null;
  place: string;
  lat: number;
  lon: number;
  timeUtc: string;
  alert: string | null;
  url: string | null;
}

/** A ReliefWeb disaster item (country-level, no coordinate). */
export interface ReliefWebInput {
  title: string;
  countries: string[];
  link: string;
}

/** Splits GDACS's comma-joined country string into a trimmed list. */
function splitCountries(country: string): string[] {
  return country
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function makeStory(partial: Omit<Story, "triageSeverity" | "suppressed">): Story {
  const { triageSeverity, suppressed } = assignTriage(partial.gdacsAlert, partial.pagerAlert);
  return { ...partial, triageSeverity, suppressed };
}

/**
 * Builds the reconciled Story list from the three feeds' inputs.
 * ReliefWeb items are attached to non-EQ stories that share a country, or
 * kept as their own supplementary-only entries when nothing matches.
 */
export function reconcile(
  gdacs: GdacsInput[],
  usgs: UsgsInput[],
  reliefweb: ReliefWebInput[],
): Story[] {
  // Index every USGS event by each of its ids, so a GDACS sourceid can match
  // whichever network prefix the id currently carries (feeds/blindspots.md:
  // match the ids list, not the single preferred id).
  const usgsByAnyId = new Map<string, UsgsInput>();
  for (const u of usgs) {
    for (const id of u.ids) usgsByAnyId.set(id, u);
    usgsByAnyId.set(u.id, u);
  }

  const matchedUsgs = new Set<string>();
  const stories: Story[] = [];

  // GDACS records first — these can absorb a USGS event via the EQ join.
  for (const g of gdacs) {
    const isEq = g.hazardType.toUpperCase() === "EQ";
    const joined = isEq && g.sourceId ? usgsByAnyId.get(g.sourceId) : undefined;

    if (joined) {
      matchedUsgs.add(joined.id);
      stories.push(
        makeStory({
          id: joined.id,
          hazardType: "EQ",
          title: g.name,
          countries: splitCountries(g.country),
          lat: joined.lat, // USGS coordinate is the precise epicentre
          lon: joined.lon,
          timeUtc: joined.timeUtc,
          mag: joined.mag,
          gdacsAlert: g.alertLevel,
          pagerAlert: joined.alert,
          reconciled: true,
          sources: [
            { feed: "gdacs", url: g.reportUrl },
            { feed: "usgs", url: joined.url },
          ],
          supplementary: [],
        }),
      );
    } else {
      stories.push(
        makeStory({
          id: g.eventId,
          hazardType: g.hazardType,
          title: g.name,
          countries: splitCountries(g.country),
          lat: g.lat,
          lon: g.lon,
          timeUtc: g.fromDate,
          mag: null,
          gdacsAlert: g.alertLevel,
          pagerAlert: null,
          reconciled: false,
          sources: [{ feed: "gdacs", url: g.reportUrl }],
          supplementary: [],
        }),
      );
    }
  }

  // USGS events not absorbed by a GDACS join stand alone.
  for (const u of usgs) {
    if (matchedUsgs.has(u.id)) continue;
    stories.push(
      makeStory({
        id: u.id,
        hazardType: "EQ",
        title: u.place,
        countries: [],
        lat: u.lat,
        lon: u.lon,
        timeUtc: u.timeUtc,
        mag: u.mag,
        gdacsAlert: null,
        pagerAlert: u.alert,
        reconciled: false,
        sources: [{ feed: "usgs", url: u.url }],
        supplementary: [],
      }),
    );
  }

  // ReliefWeb items: attach to a loosely-matching non-EQ story sharing an
  // in-scope country (docs/adr/0004); otherwise keep as a standalone
  // supplementary entry. Never merged, never affects severity.
  for (const r of reliefweb) {
    const host = stories.find(
      (s) =>
        s.hazardType.toUpperCase() !== "EQ" &&
        s.countries.some((c) => r.countries.includes(c)),
    );
    if (host) {
      host.supplementary.push({ title: r.title, url: r.link });
    } else {
      // A standalone ReliefWeb item is an editorial "this reached a critical
      // point" verdict, not an alert-tiered signal. Green-tier suppression
      // (docs/adr/0008) is about background-seismicity *alert* noise, so it
      // must not apply here — a ReliefWeb page has no alert tier at all, and
      // suppressing it as if it were "Green" would hide a curated signal.
      const story = makeStory({
        id: `reliefweb:${r.link}`,
        hazardType: "OTHER",
        title: r.title,
        countries: r.countries,
        lat: null,
        lon: null,
        timeUtc: null,
        mag: null,
        gdacsAlert: null,
        pagerAlert: null,
        reconciled: false,
        sources: [{ feed: "reliefweb", url: r.link }],
        supplementary: [{ title: r.title, url: r.link }],
      });
      story.suppressed = false;
      stories.push(story);
    }
  }

  return stories;
}
