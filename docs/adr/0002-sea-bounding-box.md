# Use a lat/lon bounding box, not country polygons, for offshore SEA filtering

USGS earthquakes and GDACS cyclone tracks are raw coordinates with no
country field, so country-based filtering (used for GDACS/ReliefWeb events
that carry `country`/`iso3`) doesn't apply — an offshore Sunda Trench quake
or a cyclone still over open water can threaten SEA coasts without its
coordinate landing inside any country's land polygon.

We chose a single rectangular bounding box, `92°E–141°E, 15°S–29°N`, over
point-in-polygon tests against country shapes. The box covers the ASEAN-10
+ Timor-Leste land area plus the Andaman Sea, South China Sea, Sulu/Celebes/
Java/Banda Seas, and the full Sunda Trench down past Sumba/Flores toward
the Banda arc. It deliberately over-includes some open ocean and slivers of
China/India/Australia's EEZs — for USGS this means a few harmless extra
points to review, which is a far cheaper failure mode than silently
dropping a real offshore threat via an under-inclusive precise boundary.

The northern bound is 29°N, not a tighter figure closer to most of the
ASEAN mainland, because Myanmar's Kachin State extends to roughly 28.5°N —
a tighter box would clip part of an in-scope country's own territory. This
matters beyond simple point coverage: since USGS has no country field, its
query is bounded by this box alone, so an under-reach here wouldn't just
miss a standalone USGS story, it would silently break the GDACS↔USGS EQ
join for a real earthquake in northern Myanmar — GDACS would report it
(it has a proper `country` field), but the USGS side of the query would
never fetch the matching record to join against.

This also lets the filter run server-side: USGS's FDSN query API accepts
`minlatitude/maxlatitude/minlongitude/maxlongitude` directly, so the SEA
filter is a query parameter, not a client-side post-filter over the global
feed.
