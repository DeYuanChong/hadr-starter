/**
 * Minimal, hand-rolled RSS parsing for ReliefWeb's flat `<item>` structure
 * (see feeds/reliefweb.md for a real example). No general-purpose XML
 * parser dependency is used: the feed is a flat list of items with a
 * handful of non-nested child tags, so a small tag-extractor is simpler
 * and dependency-free (per docs/adr/0013's build-strategy call and the
 * task's own steer toward "regex or a tiny manual tag-extractor").
 *
 * This is NOT a general XML parser — it assumes the shape ReliefWeb's
 * disaster RSS actually uses and degrades to "field missing" (null) rather
 * than throwing when a tag is absent or malformed.
 */

/** Raw, un-decoded fields lifted straight out of one <item>...</item> block. */
export interface RawRssItem {
  title: string | null;
  link: string | null;
  pubDate: string | null;
  description: string | null;
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

/** Splits a full RSS document into its raw <item> blocks. Returns [] if none are found. */
export function extractItemBlocks(xml: string): string[] {
  const matches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi);
  return matches ?? [];
}

/** Pulls title/link/pubDate/description out of one <item> block. */
export function parseItemBlock(block: string): RawRssItem {
  return {
    title: extractTag(block, "title"),
    link: extractTag(block, "link"),
    pubDate: extractTag(block, "pubDate"),
    description: extractTag(block, "description"),
  };
}

/** Parses a full ReliefWeb disasters RSS document into raw items. */
export function parseRssItems(xml: string): RawRssItem[] {
  return extractItemBlocks(xml).map(parseItemBlock);
}

const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&amp;": "&",
};

/** Decodes the small set of HTML entities ReliefWeb's RSS actually uses
 *  (its description field is HTML, escaped once for XML). */
export function decodeEntities(input: string): string {
  return input.replace(/&lt;|&gt;|&quot;|&#39;|&apos;|&amp;/g, (m) => HTML_ENTITIES[m] ?? m);
}
