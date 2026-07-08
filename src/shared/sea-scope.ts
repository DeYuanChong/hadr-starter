/**
 * Southeast Asia scope, per docs/adr/0001-sea-country-list.md and
 * docs/adr/0002-sea-bounding-box.md. Shared across feed fetchers so scope
 * is defined once, not re-derived per feed.
 */

/** ASEAN-10 + Timor-Leste. PNG and southern China are deliberately excluded. */
export const SEA_COUNTRIES_ISO3 = new Set([
  "BRN", // Brunei
  "KHM", // Cambodia
  "IDN", // Indonesia
  "LAO", // Laos
  "MYS", // Malaysia
  "MMR", // Myanmar
  "PHL", // Philippines
  "SGP", // Singapore
  "THA", // Thailand
  "VNM", // Vietnam
  "TLS", // Timor-Leste
]);

/**
 * Bounding box for feeds with no country field (USGS points, GDACS cyclone
 * tracks). Northern bound reaches 29°N to clear Myanmar's Kachin State
 * (~28.5°N); southern bound reaches 15°S to cover the full Sunda Trench.
 */
export const SEA_BOUNDING_BOX = {
  minLat: -15,
  maxLat: 29,
  minLon: 92,
  maxLon: 141,
};

/** True if the given ISO3 country code is in the Southeast Asia scope. */
export function isCountryInScope(iso3: string | null | undefined): boolean {
  if (!iso3) return false;
  return SEA_COUNTRIES_ISO3.has(iso3.trim().toUpperCase());
}

/** True if the given coordinate falls within the SEA bounding box. */
export function isPointInScope(lat: number, lon: number): boolean {
  const { minLat, maxLat, minLon, maxLon } = SEA_BOUNDING_BOX;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}
