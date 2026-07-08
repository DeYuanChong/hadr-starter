/**
 * Local Southeast Asia country-name lookup, for this feed only.
 *
 * ReliefWeb's RSS feed embeds the affected-country *name* as free text in
 * the description HTML (see feeds/reliefweb.md), not an ISO3 code.
 * `src/shared/sea-scope.ts`'s `SEA_COUNTRIES_ISO3` is ISO3-keyed and shared
 * with the GDACS/USGS feed branches being built concurrently, so rather
 * than modifying it (and risking a merge conflict across three PRs) this
 * file maps ReliefWeb's name spellings onto the same 11 ISO3 codes locally,
 * then defers to `isCountryInScope` for the actual scope check.
 *
 * Covers common short names plus official long-form names ReliefWeb is
 * known to use (e.g. "Lao People's Democratic Republic", "Viet Nam") per
 * docs/adr/0001-sea-country-list.md's country list.
 */

const SEA_NAME_TO_ISO3: Record<string, string> = {
  brunei: "BRN",
  "brunei darussalam": "BRN",

  cambodia: "KHM",
  "kingdom of cambodia": "KHM",

  indonesia: "IDN",
  "republic of indonesia": "IDN",

  laos: "LAO",
  "lao pdr": "LAO",
  "lao people's democratic republic": "LAO",

  malaysia: "MYS",

  myanmar: "MMR",
  burma: "MMR",
  "republic of the union of myanmar": "MMR",

  philippines: "PHL",
  "the philippines": "PHL",
  "republic of the philippines": "PHL",

  singapore: "SGP",
  "republic of singapore": "SGP",

  thailand: "THA",
  "kingdom of thailand": "THA",

  "timor-leste": "TLS",
  "timor leste": "TLS",
  "east timor": "TLS",
  "democratic republic of timor-leste": "TLS",

  vietnam: "VNM",
  "viet nam": "VNM",
  "socialist republic of viet nam": "VNM",
};

/** Lowercases, collapses whitespace, and drops a trailing "(...)" qualifier
 *  (e.g. "Venezuela (Bolivarian Republic of)") before lookup. */
function normalize(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Returns the ISO3 code if `name` matches a known SEA country name, else null. */
export function seaIso3ForCountryName(name: string): string | null {
  if (!name) return null;
  return SEA_NAME_TO_ISO3[normalize(name)] ?? null;
}
