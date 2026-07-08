/**
 * Test fixtures for src/feeds/gdacs/index.test.ts.
 *
 * The single-country shapes below are lifted directly from the worked
 * example in feeds/gdacs.md (Earthquake in Japan). The multi-country and
 * malformed shapes are modelled on real live-response quirks observed while
 * building this feed (verified 8 Jul 2026 against
 * https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP):
 *
 * - GDACS's top-level `iso3` is always a single code, even for events whose
 *   `country` string names several countries (e.g. a live Tropical Cyclone
 *   BAVI record had `iso3: "CHN"` while `country` was
 *   "Guam, Northern Mariana Islands, Japan, Taiwan, China").
 * - `affectedcountries` is the more complete structured list, but was also
 *   observed under-listing: a live wildfire record with
 *   `country: "Angola, The Democratic Republic of Congo"` had
 *   `affectedcountries` naming only Angola.
 * - `iso3` is sometimes an empty string (e.g. a live "Jan Mayen Island
 *   Region" earthquake had `iso3: ""`).
 *
 * Never fetched live in a test — this module only holds static data.
 */

/** feeds/gdacs.md's worked example, verbatim shape: Japan, out of SEA scope. */
export const japanEarthquakeFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [141.845, 40.4353] },
  properties: {
    eventtype: "EQ",
    eventid: 1550421,
    episodeid: 1716583,
    glide: "",
    name: "Earthquake in Japan",
    htmldescription: "Green M 4.6 Earthquake in Japan at: 06 Jul 2026 11:29:36.",
    alertlevel: "Green",
    alertscore: 1,
    episodealertlevel: "Green",
    episodealertscore: 0.0,
    istemporary: "false",
    iscurrent: "true",
    country: "Japan",
    fromdate: "2026-07-06T11:29:36",
    todate: "2026-07-06T11:29:36",
    datemodified: "2026-07-06T12:09:48",
    iso3: "JPN",
    source: "NEIC",
    url: {
      report: "https://www.gdacs.org/report.aspx?eventid=1550421&episodeid=1716583&eventtype=EQ",
      details: "https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=EQ&eventid=1550421",
    },
  },
};

/** Same shape as the Japan example, swapped to an in-scope SEA country
 * (Philippines), mirroring a real live "Earthquake in Philippines" record. */
export const philippinesEarthquakeFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [126.6, 8.2] },
  properties: {
    eventtype: "EQ",
    eventid: 1550700,
    episodeid: 1716900,
    glide: "",
    name: "Earthquake in Philippines",
    htmldescription: "Green M 4.9 Earthquake in Philippines at: 07 Jul 2026 20:37:40.",
    alertlevel: "Green",
    alertscore: 1,
    episodealertlevel: "Green",
    episodealertscore: 0.0,
    istemporary: "false",
    iscurrent: "true",
    country: "Philippines",
    fromdate: "2026-07-07T20:37:40",
    todate: "2026-07-07T20:37:40",
    datemodified: "2026-07-07T21:10:00",
    iso3: "PHL",
    source: "NEIC",
    affectedcountries: [{ iso2: "PH", iso3: "PHL", countryname: "Philippines" }],
    url: {
      report: "https://www.gdacs.org/report.aspx?eventid=1550700&episodeid=1716900&eventtype=EQ",
      details: "https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=EQ&eventid=1550700",
    },
  },
};

/**
 * Multi-country tropical cyclone, modelled on a real live BAVI-26 record.
 * Top-level `iso3` names only China — the non-SEA country GDACS happened to
 * put there — while `country` and `affectedcountries` also name the
 * Philippines. This is the shape that would slip past a filter that only
 * ever reads the top-level `iso3` string, and is why isRecordInScope also
 * consults `affectedcountries`.
 */
export const multiCountryCycloneFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [125.0, 15.0] },
  properties: {
    eventtype: "TC",
    eventid: 1560000,
    episodeid: 1720000,
    glide: "",
    name: "Tropical Cyclone EXAMPLE-26",
    htmldescription: "Orange Tropical Cyclone EXAMPLE-26",
    alertlevel: "Orange",
    alertscore: 2,
    episodealertlevel: "Orange",
    episodealertscore: 1.5,
    istemporary: "false",
    iscurrent: "true",
    // Full multi-country footprint, shown in full per docs/adr/0003.
    country: "Philippines, Taiwan, China",
    fromdate: "2026-07-08T00:00:00",
    todate: "2026-07-10T00:00:00",
    datemodified: "2026-07-08T06:00:00",
    // Matches the real live pattern: a single non-SEA code even though the
    // event is genuinely multi-country.
    iso3: "CHN",
    source: "JTWC",
    affectedcountries: [
      { iso2: "PH", iso3: "PHL", countryname: "Philippines" },
      { iso2: "TW", iso3: "TWN", countryname: "Taiwan" },
      { iso2: "CN", iso3: "CHN", countryname: "China" },
    ],
    url: {
      report: "https://www.gdacs.org/report.aspx?eventid=1560000&episodeid=1720000&eventtype=TC",
      details: "https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=TC&eventid=1560000",
    },
  },
};

/** Real-shape quirk: `iso3` is an empty string (observed live for a "Jan
 * Mayen Island Region" earthquake) and there is no `affectedcountries`
 * array at all. Out of scope, and must not crash the parser. */
export const missingIso3Feature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-7.1298, 71.1194] },
  properties: {
    eventtype: "EQ",
    eventid: 1550718,
    episodeid: 1716915,
    name: "Earthquake in Jan Mayen Island Region",
    alertlevel: "Green",
    alertscore: 1,
    country: "Jan Mayen Island Region",
    fromdate: "2026-07-08T04:21:46",
    todate: "2026-07-08T04:21:46",
    iso3: "",
    source: "NEIC",
    url: {
      report: "https://www.gdacs.org/report.aspx?eventid=1550718&episodeid=1716915&eventtype=EQ",
      details: "https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=EQ&eventid=1550718",
    },
  },
};

/** Grab-bag of malformed shapes a live, "moving target" feed
 * (feeds/blindspots.md #9) could plausibly send. None of these should throw
 * when parsed — each should either be skipped (logged) or degraded
 * gracefully to a placeholder value. */
export const malformedFeatures = {
  /** Not an object at all. */
  notAnObject: "this is not a feature",
  /** An object with no `properties` key. */
  noProperties: { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
  /** `iso3` present but the wrong type (defensive: schema drift). */
  iso3WrongType: {
    type: "Feature",
    properties: {
      eventtype: "EQ",
      eventid: 999,
      name: "Earthquake with malformed iso3",
      alertlevel: "Green",
      country: "Nowhere",
      fromdate: "2026-07-08T00:00:00",
      iso3: 12345, // should be a string
      url: { report: "https://www.gdacs.org/report.aspx?eventid=999" },
    },
  },
  /** `affectedcountries` present but not an array. */
  affectedCountriesWrongType: {
    type: "Feature",
    properties: {
      eventtype: "WF",
      eventid: 998,
      name: "Wildfire with malformed affectedcountries",
      alertlevel: "Green",
      country: "Nowhere",
      fromdate: "2026-07-08T00:00:00",
      iso3: "",
      affectedcountries: "PHL",
      url: { report: "https://www.gdacs.org/report.aspx?eventid=998" },
    },
  },
};
