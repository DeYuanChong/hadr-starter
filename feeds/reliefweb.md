# ReliefWeb

UN OCHA's humanitarian information service. Curated and slower-moving than the
other two feeds: a "disaster" appears here once humans decide it matters.

## Endpoint

    https://api.reliefweb.int/v2/disasters?appname=<your-approved-appname>&preset=latest

Two things to know, both verified 6 Jul 2026:

- `v1` has been decommissioned; it returns HTTP 410.
- Since 1 November 2025 the API requires a **pre-approved** `appname`,
  requested via a form and confirmed by email:
  https://apidoc.reliefweb.int/parameters#appname

Without an approved appname:

```json
{
  "status": 403,
  "error": {
    "type": "AccessDeniedHttpException",
    "message": "You are not using an approved appname. Kindly request an appname from ReliefWeb here: https://apidoc.reliefweb.int/parameters#appname"
  }
}
```

The RSS feed needs no approval:

    https://reliefweb.int/disasters/rss.xml

## Example response (truncated, from the RSS feed)

```xml
<item>
  <title>Venezuela: Earthquakes - Jun 2026</title>
  <link>https://reliefweb.int/disaster/eq-2026-000093-ven</link>
  <pubDate>Wed, 24 Jun 2026 00:00:00 +0000</pubDate>
  <description>
    &lt;div class="tag country"&gt;Affected country: Venezuela (Bolivarian Republic of)&lt;/div&gt;
    &lt;div class="tag glide"&gt;Glide: EQ-2026-000093-VEN&lt;/div&gt;
    &lt;p&gt;On 24 June 2026, two strong earthquakes, preliminarily measured at
    magnitudes 7.1 and 7.5, struck north-central Venezuela in rapid
    succession, with epicentres near Morón, Carabobo State. ...&lt;/p&gt;
  </description>
</item>
```

## Gotchas

- The API `appname` approval can take time to arrive, and the RSS fallback may
  403 non-browser clients. This project builds against the **RSS feed** with a
  browser User-Agent and falls back to a bundled fixture when even that fails,
  always disclosing which source produced the page — see
  [ADR-0013](../docs/adr/0013-reliefweb-adapter-and-fixture-fallback.md).
- A ReliefWeb entry often describes an event GDACS and USGS reported days
  earlier under different identifiers. For earthquakes it can *confirm* an
  existing Story (the EQ join); for other hazards it is attached only as a
  Supplementary link, never merged — see [CONTEXT.md](../CONTEXT.md).
- ReliefWeb content is redistribution-restricted: the report only ever carries
  a one-sentence own-words paraphrase with attribution and a link back, never a
  direct quote — see [ADR-0015](../docs/adr/0015-zero-reliefweb-quotes.md).
