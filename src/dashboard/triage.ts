/**
 * Triage severity and suppression — the stateless parts of the severity
 * model (docs/adr/0007, docs/adr/0008).
 *
 * Triage severity is the higher of the GDACS alert colour and the USGS PAGER
 * alert (docs/adr/0007); for non-EQ hazards, which have no PAGER equivalent,
 * it is simply the GDACS colour alone (the single-source case of the same
 * rule). Both raw values are always retained on the Story and shown — triage
 * severity decides ordering and suppression only, it never hides that the two
 * disagreed.
 *
 * A story is Suppressed when its triage severity is Green-tier or absent
 * (docs/adr/0008). Suppression here is a pure function of the current
 * snapshot. The "an escalation out of Green is never suppressed" half of
 * ADR-0008 depends on prior state and is out of scope for this build.
 */

import { type AlertTier, maxTier, TIER_RANK, toTier } from "../shared/story.js";

export interface Triage {
  triageSeverity: AlertTier;
  suppressed: boolean;
}

/** Derives triage severity and suppression from the raw feed alerts. */
export function assignTriage(
  gdacsAlert: string | null,
  pagerAlert: string | null,
): Triage {
  const triageSeverity = maxTier(toTier(gdacsAlert), toTier(pagerAlert));
  // Green-tier or no alert at all -> suppressed from the report body.
  const suppressed = TIER_RANK[triageSeverity] <= TIER_RANK.green;
  return { triageSeverity, suppressed };
}
