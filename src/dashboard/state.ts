/**
 * Persistence and the Story state machine — the stateful half of the PRD's
 * user stories.
 *
 * - state.json (docs/adr/0012): one flat, human-readable JSON file at the
 *   repo root, written atomically (temp file + rename). Holds per-feed
 *   cursors and a snapshot of every tracked story.
 * - State machine (docs/adr/0005): each run diffs current stories against
 *   the persisted prior run → new / escalated / de-escalated / revised /
 *   confirmed / deleted.
 * - Corrections (docs/adr/0006): transitions become "Since yesterday" lines;
 *   a deleted story is mentioned exactly once (its snapshot survives one
 *   more run with state "deleted", then is purged).
 * - Cursors (docs/adr/0011): advanced only when the feed's fetch succeeded;
 *   a failed feed keeps its old cursor AND its stories are carried forward
 *   unchanged — absence during an outage must never read as deletion.
 *
 * applyStateMachine() is pure (all I/O stays in load/save), so every
 * transition rule is unit-testable without the network or the filesystem.
 */

import { rename, readFile, writeFile } from "node:fs/promises";

import { TIER_RANK, type AlertTier, type Feed, type StoryState } from "../shared/story.js";
import type { Story } from "../shared/story.js";
import type { FeedHealth } from "./render.js";

/** Per-feed catch-up cursor (docs/adr/0011). `watermark` records the feed's
 * own version cursor (GDACS max `datemodified`, USGS max `updated`) for
 * future delta polling; `lastSuccessAt` is what the USGS query start
 * extension uses today. */
export interface FeedCursor {
  lastSuccessAt: string | null;
  watermark: string | null;
}

/** The persisted snapshot of one tracked story — just what diffing needs,
 * not the full render payload. */
export interface StorySnapshot {
  id: string;
  aliases: string[];
  hazardType: string;
  title: string;
  tier: AlertTier;
  gdacsAlert: string | null;
  pagerAlert: string | null;
  mag: number | null;
  countries: string[];
  feeds: Feed[];
  /** Epoch ms of the event itself (not of any fetch), for distinguishing
   * "aged out of the USGS query window" from "deleted by the source". */
  eventTimeMs: number | null;
  /** True if any ReliefWeb page has ever been attached — flipping from
   * false to true on an EQ story is what fires "confirmed" (docs/adr/0005). */
  hadSupplementary: boolean;
  /** True once the story has appeared unsuppressed in a published report.
   * Gates the Since-yesterday lines: only previously-reported stories get
   * de-escalation/revision/deletion mentions (docs/adr/0006). */
  everReported: boolean;
  state: StoryState;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PersistedState {
  version: 1;
  lastRunAt: string;
  cursors: Record<Feed, FeedCursor>;
  stories: Record<string, StorySnapshot>;
}

/** One "Since yesterday" line (docs/adr/0006). */
export interface ChangeLine {
  kind: Exclude<StoryState, "unchanged">;
  storyId: string;
  title: string;
  hazardType: string;
  /** Human-readable what-changed, e.g. "Green → Orange" or "M6.7 → M6.9". */
  detail: string;
}

export interface StateMachineResult {
  /** Current stories, with their state fields set by the diff. */
  stories: Story[];
  /** Since-yesterday lines, most-severe kind first. */
  changes: ChangeLine[];
  /** ISO time of the prior run, or null on the first run ever. */
  priorRunAt: string | null;
  nextState: PersistedState;
}

const EMPTY_CURSORS: Record<Feed, FeedCursor> = {
  gdacs: { lastSuccessAt: null, watermark: null },
  usgs: { lastSuccessAt: null, watermark: null },
  reliefweb: { lastSuccessAt: null, watermark: null },
};

/** Parses feed timestamps defensively: GDACS ISO strings carry no timezone
 * suffix but are implicitly UTC (feeds/blindspots.md), so bare timestamps
 * get a "Z" appended rather than being read as local time. */
export function parseUtcish(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  const hasTz = /(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})$/i.test(s);
  let t = Date.parse(hasTz ? s : `${s}Z`);
  if (Number.isNaN(t)) t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function toSnapshot(story: Story, now: string, prior?: StorySnapshot): StorySnapshot {
  return {
    id: story.id,
    aliases: story.aliases,
    hazardType: story.hazardType,
    title: story.title,
    tier: story.triageSeverity,
    gdacsAlert: story.gdacsAlert,
    pagerAlert: story.pagerAlert,
    mag: story.mag,
    countries: story.countries,
    feeds: [...new Set(story.sources.map((s) => s.feed))],
    eventTimeMs: parseUtcish(story.timeUtc),
    hadSupplementary: (prior?.hadSupplementary ?? false) || story.supplementary.length > 0,
    everReported: (prior?.everReported ?? false) || !story.suppressed,
    state: story.state,
    firstSeenAt: prior?.firstSeenAt ?? now,
    lastSeenAt: now,
  };
}

function tierLabel(t: AlertTier): string {
  return t === "none" ? "no alert" : t;
}

/** Material-change detection for "revised": the fields a reader would act
 * on, not every byte of feed churn. */
function revisionDetail(prior: StorySnapshot, cur: Story): string | null {
  const parts: string[] = [];
  if (prior.mag !== null && cur.mag !== null && Math.abs(prior.mag - cur.mag) >= 0.05) {
    parts.push(`M${prior.mag.toFixed(1)} → M${cur.mag.toFixed(1)}`);
  }
  if ((prior.gdacsAlert ?? "") !== (cur.gdacsAlert ?? "")) {
    parts.push(`GDACS ${prior.gdacsAlert ?? "—"} → ${cur.gdacsAlert ?? "—"}`);
  }
  if ((prior.pagerAlert ?? "") !== (cur.pagerAlert ?? "")) {
    parts.push(`PAGER ${prior.pagerAlert ?? "—"} → ${cur.pagerAlert ?? "—"}`);
  }
  const priorCountries = prior.countries.join(", ");
  const curCountries = cur.countries.join(", ");
  if (priorCountries !== curCountries && priorCountries !== "" && curCountries !== "") {
    parts.push(`affected: ${priorCountries} → ${curCountries}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

const KIND_ORDER: Record<ChangeLine["kind"], number> = {
  escalated: 0,
  deleted: 1,
  "de-escalated": 2,
  confirmed: 3,
  revised: 4,
  new: 5,
};

/**
 * The state machine. Diffs current stories against the prior persisted run
 * and produces per-story states, Since-yesterday lines, and the next state
 * to persist.
 *
 * @param usgsWindowStartMs Start of this run's USGS query window. A prior
 *   USGS-only story older than this has merely aged out of the window we
 *   asked for — that is a silent drop, never a "deleted" (the source didn't
 *   remove it; we stopped asking about it).
 */
export function applyStateMachine(
  prior: PersistedState | null,
  current: Story[],
  health: FeedHealth[],
  now: Date,
  usgsWindowStartMs: number | null,
  watermarks: Partial<Record<Feed, string | null>> = {},
): StateMachineResult {
  const nowIso = now.toISOString();
  const liveFeeds = new Set(health.filter((h) => h.status === "live").map((h) => h.feed));

  // Purge snapshots that already had their one "deleted" mention last run
  // (docs/adr/0006: mentioned exactly once, then omitted).
  const priorStories = Object.values(prior?.stories ?? {}).filter((s) => s.state !== "deleted");

  const priorByAlias = new Map<string, StorySnapshot>();
  for (const snap of priorStories) {
    for (const a of snap.aliases) priorByAlias.set(a, snap);
  }

  const changes: ChangeLine[] = [];
  const nextStories: Record<string, StorySnapshot> = {};
  const matchedPrior = new Set<StorySnapshot>();

  for (const story of current) {
    const priorSnap = story.aliases.map((a) => priorByAlias.get(a)).find(Boolean);

    if (!priorSnap) {
      story.state = "new";
      // A new story is a Since-yesterday line only when it's actually in the
      // report body; announcing the arrival of a suppressed Green quake would
      // reintroduce exactly the noise ADR-0008 suppresses.
      if (!story.suppressed && prior !== null) {
        changes.push({
          kind: "new",
          storyId: story.id,
          title: story.title,
          hazardType: story.hazardType,
          detail: `new ${tierLabel(story.triageSeverity)}-tier story`,
        });
      }
    } else {
      matchedPrior.add(priorSnap);
      const priorRank = TIER_RANK[priorSnap.tier];
      const curRank = TIER_RANK[story.triageSeverity];
      const confirmedNow =
        story.hazardType.toUpperCase() === "EQ" &&
        !priorSnap.hadSupplementary &&
        story.supplementary.length > 0;

      // Exactly one state per story (docs/adr/0005). Severity moves outrank
      // confirmation — they're what a sitrep must foreground — and a
      // simultaneous confirmation still shows its link either way
      // (confirmation is additive-only, docs/adr/0009).
      let detail: string | null;
      if (curRank > priorRank) {
        story.state = "escalated";
        detail = `${tierLabel(priorSnap.tier)} → ${tierLabel(story.triageSeverity)}`;
      } else if (curRank < priorRank) {
        story.state = "de-escalated";
        detail = `${tierLabel(priorSnap.tier)} → ${tierLabel(story.triageSeverity)}`;
      } else if (confirmedNow) {
        story.state = "confirmed";
        detail = "ReliefWeb page now exists for this event";
      } else {
        detail = revisionDetail(priorSnap, story);
        story.state = detail ? "revised" : "unchanged";
      }

      // Since-yesterday lines gate on visibility (docs/adr/0006): the story
      // must have been reported before, or be reported now. An escalation
      // out of Green satisfies the second clause by definition, so it can
      // never be lost (docs/adr/0008).
      const visible = priorSnap.everReported || !story.suppressed;
      if (story.state !== "unchanged" && visible) {
        changes.push({
          kind: story.state as ChangeLine["kind"],
          storyId: story.id,
          title: story.title,
          hazardType: story.hazardType,
          detail: detail ?? "",
        });
      }
    }

    const snap = toSnapshot(story, nowIso, priorSnap);
    nextStories[snap.id] = snap;
  }

  // Prior stories that vanished this run.
  for (const snap of priorStories) {
    if (matchedPrior.has(snap)) continue;

    // Any source feed not live this run → can't tell absence from outage;
    // carry the story forward untouched (docs/adr/0011's spirit: an outage
    // must never be read as data).
    const allFeedsLive = snap.feeds.every((f) => liveFeeds.has(f));
    if (!allFeedsLive) {
      nextStories[snap.id] = { ...snap, state: "unchanged" };
      continue;
    }

    // USGS-only stories older than this run's query window aged out of the
    // window we asked for — silent drop, not a deletion.
    const usgsOnly = snap.feeds.length === 1 && snap.feeds[0] === "usgs";
    if (
      usgsOnly &&
      usgsWindowStartMs !== null &&
      snap.eventTimeMs !== null &&
      snap.eventTimeMs < usgsWindowStartMs
    ) {
      continue;
    }

    // Gone while its feeds were live: the source no longer returns it as
    // current (docs/adr/0005's "deleted"). One mention, then purged.
    const deletedSnap: StorySnapshot = { ...snap, state: "deleted", lastSeenAt: snap.lastSeenAt };
    nextStories[snap.id] = deletedSnap;
    if (snap.everReported) {
      changes.push({
        kind: "deleted",
        storyId: snap.id,
        title: snap.title,
        hazardType: snap.hazardType,
        detail: "no longer listed as current by its source feed — treat as withdrawn/resolved",
      });
    }
  }

  changes.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  // Cursors advance only on success (docs/adr/0011); a failed feed keeps its
  // previous cursor unmoved.
  const cursors: Record<Feed, FeedCursor> = { ...EMPTY_CURSORS, ...(prior?.cursors ?? {}) };
  for (const feed of ["gdacs", "usgs", "reliefweb"] as Feed[]) {
    if (liveFeeds.has(feed)) {
      cursors[feed] = {
        lastSuccessAt: nowIso,
        watermark: watermarks[feed] ?? cursors[feed]?.watermark ?? null,
      };
    }
  }

  return {
    stories: current,
    changes,
    priorRunAt: prior?.lastRunAt ?? null,
    nextState: {
      version: 1,
      lastRunAt: nowIso,
      cursors,
      stories: nextStories,
    },
  };
}

/** Loads state.json, or null on the first run / unreadable file. A corrupt
 * state file degrades to "first run" (everything new) rather than crashing
 * the publish — the report must still go out (REQS.md item 5). */
export async function loadState(path: string | URL): Promise<PersistedState | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null; // first run
  }
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed && parsed.version === 1 && parsed.stories && parsed.cursors) return parsed;
    console.warn("[state] state.json has an unexpected shape; treating as first run");
    return null;
  } catch (err) {
    console.warn(
      `[state] state.json is unreadable (${err instanceof Error ? err.message : String(err)}); treating as first run`,
    );
    return null;
  }
}

/** Atomic write per docs/adr/0012: temp file, then rename. */
export async function saveState(path: string, state: PersistedState): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}
