/**
 * The Story: the reconciled representation of one physical disaster, built
 * from one or more feed records (CONTEXT.md). For earthquakes a Story may
 * merge GDACS + USGS records via the solved EQ join (GDACS `sourceid` ↔ USGS
 * `ids`); for every other hazard type it is GDACS-sourced (docs/adr/0004).
 *
 * This is the dashboard's unit. Unlike the per-feed "records" the feed
 * fetchers produce, a Story carries a triage severity derived across feeds
 * (docs/adr/0007) and the suppression flag (docs/adr/0008).
 *
 * Scope note: this build assembles Stories from a single fetch snapshot.
 * The history-dependent parts of the Story model — the state machine
 * (new/escalated/…/deleted, docs/adr/0005), the "since yesterday" diff
 * (docs/adr/0006), and confirmation-as-a-transition (docs/adr/0009) — need
 * persisted prior state and are deliberately out of scope here. See the
 * dashboard's own module docs and the coverage note it renders.
 */

export type Feed = "gdacs" | "usgs" | "reliefweb";

/** Ordered alert tiers. GDACS uses Green/Orange/Red; USGS PAGER adds yellow.
 * "none" means no alert value was present (e.g. an unassessed USGS event). */
export type AlertTier = "none" | "green" | "yellow" | "orange" | "red";

/** Rank for comparing tiers. Higher is more severe. */
export const TIER_RANK: Record<AlertTier, number> = {
  none: 0,
  green: 1,
  yellow: 2,
  orange: 3,
  red: 4,
};

/** Normalises a raw feed alert string ("Green", "orange", null, …) to a tier.
 * Unknown/empty values become "none" rather than throwing — an unrecognised
 * value is treated as no signal, not a crash (defensive-parsing principle). */
export function toTier(raw: string | null | undefined): AlertTier {
  if (!raw) return "none";
  const v = raw.trim().toLowerCase();
  if (v === "green" || v === "orange" || v === "red" || v === "yellow") return v;
  return "none";
}

/** The more severe of two tiers. */
export function maxTier(a: AlertTier, b: AlertTier): AlertTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** A pointer back to one feed's source page for a Story. */
export interface SourceLink {
  feed: Feed;
  url: string | null;
}

/** A supplementary ReliefWeb link (docs/adr/0004): own-words title + link
 * only, never merged into the Story's severity or content (docs/adr/0015). */
export interface SupplementaryLink {
  title: string;
  url: string;
}

/**
 * The Story state machine (docs/adr/0005). Every story is in exactly one
 * state per run. "unchanged" is the absence of a transition — not one of the
 * ADR's six states, but the honest label for a story that was seen before
 * and didn't move.
 */
export type StoryState =
  | "new"
  | "escalated"
  | "de-escalated"
  | "revised"
  | "deleted"
  | "confirmed"
  | "unchanged";

export interface Story {
  /** Stable-ish identity for this run: USGS id when present, else the GDACS
   * eventid, else a ReliefWeb-derived key. */
  id: string;
  /** Raw hazard code (EQ, TC, FL, VO, DR, WF) or "OTHER". Shown as-is, since
   * GDACS can add hazard types without notice (feeds/blindspots.md). */
  hazardType: string;
  title: string;
  /** Affected countries, shown in full including any out-of-scope ones
   * (docs/adr/0003). */
  countries: string[];
  /** Epicentre / representative point for map placement, or null for a
   * country-level record with no coordinate (ReliefWeb). */
  lat: number | null;
  lon: number | null;
  /** Event time as a readable UTC string, or null if the feed gave none. */
  timeUtc: string | null;
  /** Earthquake magnitude, when known. */
  mag: number | null;
  /** Raw GDACS alert colour, shown even when it disagrees with PAGER
   * (docs/adr/0007). */
  gdacsAlert: string | null;
  /** Raw USGS PAGER alert, shown even when it disagrees with GDACS. */
  pagerAlert: string | null;
  /** The higher of the two signals — decides placement and suppression only,
   * never hides that they disagreed (docs/adr/0007). */
  triageSeverity: AlertTier;
  /** True when Green-tier or unalerted: tracked but omitted from the report
   * body (docs/adr/0008). Tier-based, so an escalation out of Green is never
   * suppressed — the escalated tier is above Green by definition; the
   * transition itself is surfaced by the state machine (docs/adr/0005). */
  suppressed: boolean;
  /** True when this Story merged records from more than one feed. */
  reconciled: boolean;
  /**
   * Every identifier this story is known by: its id, the GDACS eventid, and
   * the full USGS `ids` list. Cross-run identity matches on ANY alias — a
   * story whose preferred id changes between runs (e.g. the EQ join resolving
   * a day late, switching id from the GDACS eventid to the USGS id) must read
   * as the same story, not as a deletion plus a new arrival.
   */
  aliases: string[];
  /** State-machine position for this run (docs/adr/0005). reconcile() emits
   * "new"; the state machine (src/dashboard/state.ts) overwrites it by
   * diffing against the persisted prior run. */
  state: StoryState;
  sources: SourceLink[];
  supplementary: SupplementaryLink[];
}
