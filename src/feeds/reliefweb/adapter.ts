/**
 * ReliefWeb adapter: live RSS fetch -> raw XML text (or a failure reason),
 * per docs/adr/0013-reliefweb-adapter-and-fixture-fallback.md.
 *
 * The RSS feed needs no `appname` approval, but feeds/blindspots.md warns
 * reliefweb.int can 403 non-browser HTTP clients — untested from an actual
 * agent HTTP client until this file's fetch call runs. This sends a
 * realistic browser User-Agent and treats any failure (403, network error,
 * timeout, empty body) as "the caller should fall back," never as a throw.
 */

const RSS_URL = "https://reliefweb.int/disasters/rss.xml";
const FETCH_TIMEOUT_MS = 15_000;

// A realistic, current desktop-browser UA string (see ADR-0013 / blindspots.md #6).
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface LiveFetchOutcome {
  ok: boolean;
  xml?: string;
  /** Populated when ok is false: why the live fetch didn't produce usable XML. */
  reason?: string;
}

/**
 * Attempts the real, live RSS fetch with a browser-style User-Agent and a
 * 15s timeout. Never throws — failures come back as `{ ok: false, reason }`
 * so the caller can fall back to the fixture without a try/catch of its own.
 */
export async function fetchLiveRss(): Promise<LiveFetchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status} ${response.statusText}` };
    }
    const xml = await response.text();
    if (!xml.includes("<item")) {
      return { ok: false, reason: "response had no <item> entries (unexpected shape)" };
    }
    return { ok: true, xml };
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, reason: `timed out after ${FETCH_TIMEOUT_MS}ms` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  } finally {
    clearTimeout(timeout);
  }
}
