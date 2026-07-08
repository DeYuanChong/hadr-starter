/** A ReliefWeb disaster RSS item, reduced to what this basic events page shows. */
export interface ReliefWebEvent {
  title: string;
  /**
   * All affected countries as ReliefWeb listed them, verbatim names — shown
   * in full rather than clipped to SEA countries, mirroring the "shown in
   * full" principle in docs/adr/0003-multi-country-events-shown-in-full.md.
   * Scope decides whether the item is included, not which of its countries
   * are shown.
   */
  countries: string[];
  /** Raw pubDate string from the feed (RFC 2822), kept as-is for display. */
  pubDate: string | null;
  link: string;
}

/** Where the RSS XML behind a run's events actually came from. */
export type ReliefWebSourceStatus = "live" | "fixture" | "unavailable";
