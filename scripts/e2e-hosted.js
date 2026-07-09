/**
 * End-to-end check of the deployed dashboard: drives the real page with a
 * real browser (system Chrome via Playwright) through every interactive
 * affordance a user has — map clicks, chips, keyboard, Escape/close, hash
 * deep links, marker links, the JSON payload, and both themes.
 *
 * Run: E2E_BASE=<url> npm run e2e
 *   E2E_BASE=…    (required) the deployed page to test, e.g.
 *                 https://<user>.github.io/<repo>/ for a GitHub Pages
 *                 deployment, or http://127.0.0.1:8080/dashboard-map.html
 *                 for a local build.
 *   E2E_HEADED=1  watch it run (headed, slow-motion); default is headless.
 *
 * Exits non-zero on any failure. Screenshots land in reports/e2e-shots/
 * (gitignored). Needs Chrome installed — Playwright launches it via
 * channel:"chrome", so no browser download is required.
 *
 * This script exists because its first run against production caught two
 * real bugs the unit tests and screenshot checks had both missed (a panel
 * that could never hide, and dead same-document hash navigation) — see PR #8.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE;
if (!BASE) {
  console.error(
    "E2E_BASE is required. Set it to the deployed dashboard URL, e.g.\n" +
      "  E2E_BASE=https://<user>.github.io/<repo>/ npm run e2e\n" +
      "or, for a local build:\n" +
      "  E2E_BASE=http://127.0.0.1:8080/dashboard-map.html npm run e2e",
  );
  process.exit(2);
}
const HEADED = Boolean(process.env.E2E_HEADED);
// The hosted site serves the dashboard at the root; a local E2E_BASE should
// point at the .html file itself.
const ENTRY = BASE;
const JSON_URL = new URL("dashboard-map.json", ENTRY).href;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, "..", "reports", "e2e-shots");
const SHOT = (name) => path.join(SHOTS_DIR, `${name}.png`);

let passed = 0;
let failed = 0;
const results = [];

function check(name, cond, extra = "") {
  const ok = Boolean(cond);
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

(async () => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: "chrome",
    headless: !HEADED,
    slowMo: HEADED ? 700 : 0,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // ---- 1. Load + static structure ------------------------------------------
  const resp = await page.goto(ENTRY, { waitUntil: "load", timeout: 30000 });
  check("page loads", resp.ok(), `HTTP ${resp.status()}`);
  check("title", (await page.title()).includes("HADR Monitor"));

  check("feed health strip", (await page.locator(".health-strip li").count()) === 3);
  const healthText = await page.locator(".health-strip").innerText();
  check(
    "gdacs+usgs+reliefweb rows",
    /GDACS/i.test(healthText) && /USGS/i.test(healthText) && /RELIEFWEB/i.test(healthText),
  );
  check(
    "cadence disclosure",
    await page.locator(".cadence").innerText().then((t) => t.includes("Drought ~monthly")),
  );

  const syText = await page
    .locator("section.block:has(h2:text('Since yesterday'))")
    .innerText();
  check(
    "since-yesterday section present",
    syText.length > 0,
    syText.includes("No story changed state") ? "explicit 'nothing changed'" : "has change lines",
  );

  const markerCount = await page.locator(".markers circle").count();
  check("map markers plotted", markerCount > 0, `${markerCount} markers`);
  check("bounding box drawn", (await page.locator("rect.bbox").count()) === 1);
  check("11 country paths", (await page.locator("path.land[data-iso3]").count()) === 11);
  check("11 flag chips", (await page.locator("button.chip[data-iso3]").count()) === 11);
  check(
    "panel hidden before any selection",
    await page.locator("#country-panel").isHidden(),
    "regression: [hidden] must beat display:flex",
  );

  await page.screenshot({ path: SHOT("01-loaded") });

  // ---- 2. Click a country on the MAP ----------------------------------------
  // Myanmar: a contiguous polygon whose bounding-box centre is on land.
  // (Indonesia's bbox centre is the Java Sea between islands — clicking open
  // ocean correctly selects nothing, so archipelagos are exercised via the
  // chip and the deep link instead.)
  await page.locator('path.land[data-iso3="MMR"]').first().click();
  const panel = page.locator("#country-panel");
  await panel.waitFor({ state: "visible", timeout: 3000 });
  check("map click opens panel", await panel.isVisible());
  check("panel name = Myanmar", (await page.locator("#cp-name").innerText()) === "Myanmar");
  const summary = await page.locator("#cp-summary").innerText();
  check("wikipedia summary text", summary.length > 100, `${summary.length} chars`);
  check(
    "flag is embedded data URI",
    (await page.locator("#cp-flag").getAttribute("src")).startsWith("data:image/png"),
  );
  check(
    "wiki link points at wikipedia",
    (await page.locator("#cp-wiki").getAttribute("href")).includes("wikipedia.org"),
  );
  check(
    "attribution CC BY-SA visible",
    (await page.locator(".cp-meta").innerText()).includes("CC BY-SA 4.0"),
  );
  check("story counts line", (await page.locator("#cp-stories").innerText()).length > 10);
  check("URL hash updated", page.url().endsWith("#country=MMR"), page.url());
  check(
    "country highlighted on map",
    (await page.locator('path.land[data-iso3="MMR"].selected').count()) >= 1,
  );
  await page.screenshot({ path: SHOT("02-map-selected") });

  // ---- 3. Switch selection via a CHIP ---------------------------------------
  await page.locator('button.chip[data-iso3="PHL"]').click();
  check("chip click switches panel", (await page.locator("#cp-name").innerText()) === "Philippines");
  check("hash follows", page.url().endsWith("#country=PHL"));
  check(
    "chip visually selected",
    (await page.locator('button.chip[data-iso3="PHL"].selected').count()) === 1,
  );

  // ---- 4. Keyboard: focus a country path and press Enter ---------------------
  await page.locator('path.land[data-iso3="THA"]').first().focus();
  await page.keyboard.press("Enter");
  check("keyboard Enter selects country", (await page.locator("#cp-name").innerText()) === "Thailand");

  // ---- 5. Escape closes -------------------------------------------------------
  await page.keyboard.press("Escape");
  check("Escape closes panel", await panel.isHidden());
  check("hash cleared on close", !page.url().includes("#country"));

  // ---- 6. Hash deep-link — including same-document navigation ----------------
  await page.goto(`${ENTRY}#country=IDN`, { waitUntil: "load" });
  await panel.waitFor({ state: "visible", timeout: 3000 });
  check(
    "hash deep-link opens panel (same-document navigation)",
    (await page.locator("#cp-name").innerText()) === "Indonesia",
    "regression: needs the hashchange listener",
  );
  await page.screenshot({ path: SHOT("03-deeplink") });

  // ---- 7. Close button --------------------------------------------------------
  await page.locator("#cp-close").click();
  check("close button hides panel", await panel.isHidden());

  // ---- 8. Marker interaction: tooltip + source link ---------------------------
  const firstLinkedMarker = page.locator(".markers a circle").first();
  if ((await firstLinkedMarker.count()) > 0) {
    const tip = await firstLinkedMarker.locator("title").textContent();
    check("marker tooltip has content", tip && tip.length > 10, (tip || "").slice(0, 60));
    const href = await page.locator(".markers a").first().getAttribute("href");
    check("marker links to source", /usgs\.gov|gdacs\.org|reliefweb\.int/.test(href), href.slice(0, 60));
  } else {
    check("marker tooltip has content", markerCount === 0, "no linked markers found");
  }

  // ---- 8b. Satellite imagery (data-dependent: present when an alerted story
  // had a coordinate and GIBS had a usable scene) -------------------------------
  const satCount = await page.locator(".s-sat img").count();
  if (satCount > 0) {
    const allEmbedded = await page.evaluate(() =>
      [...document.querySelectorAll(".s-sat img")].every((i) => i.src.startsWith("data:image/")),
    );
    check("satellite imagery embedded (self-contained)", allEmbedded, `${satCount} image(s)`);
    const caption = await page.locator(".s-sat figcaption").first().innerText();
    check(
      "imagery caption: date + resolution honesty + attribution",
      /\d{4}-\d{2}-\d{2}/.test(caption) && caption.includes("375 m") && caption.includes("NASA GIBS"),
      caption.slice(0, 80),
    );
    const wv = await page.locator(".s-sat figcaption a").first().getAttribute("href");
    check("imagery links to NASA Worldview", wv.startsWith("https://worldview.earthdata.nasa.gov/"), wv.slice(0, 70));
  }

  // ---- 9. Machine-readable payload --------------------------------------------
  const json = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return { ok: r.ok, body: await r.json() };
  }, JSON_URL);
  check("dashboard-map.json serves", json.ok);
  check(
    "json has stories with state",
    Array.isArray(json.body.stories) && json.body.stories.length > 0 && "state" in json.body.stories[0],
    `${json.body.stories?.length ?? 0} stories`,
  );
  check(
    "json has sinceYesterday",
    "sinceYesterday" in json.body && "priorRunAt" in json.body.sinceYesterday,
  );
  check("json has feedHealth", Array.isArray(json.body.feedHealth));

  // ---- 10. Both themes ----------------------------------------------------------
  const darkPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark",
  });
  await darkPage.goto(`${ENTRY}#country=VNM`, { waitUntil: "load" });
  await darkPage.locator("#country-panel").waitFor({ state: "visible", timeout: 3000 });
  const darkBg = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("dark theme applies", darkBg === "rgb(18, 23, 26)", darkBg);
  await darkPage.screenshot({ path: SHOT("04-dark") });

  const lightPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
  });
  await lightPage.goto(ENTRY, { waitUntil: "load" });
  const lightBg = await lightPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("light theme applies", lightBg === "rgb(244, 246, 244)", lightBg);

  // ---- 11. No console errors on load -------------------------------------------
  const errors = [];
  const cleanPage = await browser.newPage();
  cleanPage.on("pageerror", (e) => errors.push(String(e)));
  cleanPage.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await cleanPage.goto(ENTRY, { waitUntil: "load" });
  await cleanPage.waitForTimeout(1500);
  check("zero console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  // ---- 12. About page (marketing) ----------------------------------------------
  check(
    "dashboard links to About page",
    (await page.locator('a[href="about.html"]').count()) >= 1,
  );
  const aboutPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const aboutResp = await aboutPage.goto(new URL("about.html", ENTRY).href, {
    waitUntil: "load",
  });
  check("about page serves", aboutResp.ok(), `HTTP ${aboutResp.status()}`);
  check("about title", (await aboutPage.title()).includes("HADR Monitor"));
  const aboutHeadings = await aboutPage.locator("main h2").allInnerTexts();
  for (const expected of [
    "What is this?",
    "Why it exists — and where it's headed",
    "Who it's for — and the decision it speeds up",
    "What it deliberately does not do",
  ]) {
    check(`about answers "${expected}"`, aboutHeadings.includes(expected));
  }
  check(
    "about has collapsible technical sections",
    (await aboutPage.locator("details").count()) >= 4,
  );
  check(
    "about links back to the report",
    (await aboutPage.locator('a[href="dashboard-map.html"]').count()) >= 1,
  );
  await aboutPage.screenshot({ path: SHOT("05-about"), fullPage: true });

  await browser.close();

  console.log(`\n===== E2E RESULTS (${ENTRY}) =====`);
  for (const r of results) console.log(r);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(2);
});
