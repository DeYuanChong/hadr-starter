/**
 * Local fixture RSS, shaped from the real example item in feeds/reliefweb.md
 * (itself pulled from the live feed and verified 6 Jul 2026). Per
 * docs/adr/0013, this is used ONLY when a real, live network fetch of
 * https://reliefweb.int/disasters/rss.xml fails — it is never silently
 * substituted for live data; index.ts labels fixture-sourced output
 * honestly on the rendered page.
 *
 * The Venezuela item is the doc's example verbatim (non-SEA — exercises
 * the filtering-out path). The Myanmar item is fabricated in the same
 * shape so the country-matching/extraction/rendering pipeline can still be
 * demonstrated end-to-end when the fixture is what's shown. It is not real
 * disaster data.
 */
export const FIXTURE_RSS_XML = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>ReliefWeb - Disasters</title>
    <link>https://reliefweb.int</link>
    <item>
      <title>Venezuela: Earthquakes - Jun 2026</title>
      <link>https://reliefweb.int/disaster/eq-2026-000093-ven</link>
      <guid isPermaLink="true">https://reliefweb.int/disaster/eq-2026-000093-ven</guid>
      <pubDate>Wed, 24 Jun 2026 00:00:00 +0000</pubDate>
      <description>
        &lt;div class="tag country"&gt;Affected country: Venezuela (Bolivarian Republic of)&lt;/div&gt;
        &lt;div class="tag glide"&gt;Glide: EQ-2026-000093-VEN&lt;/div&gt;
        &lt;p&gt;On 24 June 2026, two strong earthquakes, preliminarily measured at
        magnitudes 7.1 and 7.5, struck north-central Venezuela in rapid
        succession, with epicentres near Morón, Carabobo State. ...&lt;/p&gt;
      </description>
    </item>
    <item>
      <title>Myanmar: Floods - Jun 2026 (fixture)</title>
      <link>https://reliefweb.int/disaster/fl-2026-000104-mmr</link>
      <guid isPermaLink="true">https://reliefweb.int/disaster/fl-2026-000104-mmr</guid>
      <pubDate>Fri, 19 Jun 2026 00:00:00 +0000</pubDate>
      <description>
        &lt;div class="tag country"&gt;Affected country: Myanmar&lt;/div&gt;
        &lt;div class="tag glide"&gt;Glide: FL-2026-000104-MMR&lt;/div&gt;
        &lt;p&gt;Fabricated fixture item, shaped like a real ReliefWeb disaster page,
        used only to demonstrate the SEA-filtering and rendering path when
        live RSS is unreachable.&lt;/p&gt;
      </description>
    </item>
  </channel>
</rss>
`;
