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
 * (docs/adr/0008). Suppression is scoped to earthquakes: Green-alert quakes
 * are the constant background noise ADR-0008 was written to suppress, and
 * the PRD user story (docs/design/prd.html) names earthquakes explicitly.
 * Green-alert non-EQ hazards (floods, cyclones, …) are not background
 * seismicity, so they are reported. Suppression here is a pure function of
 * the current snapshot. The "an escalation out of Green is never suppressed"
 * half of ADR-0008 depends on prior state and is out of scope for this build.
 */

import { type AlertTier, maxTier, TIER_RANK, toTier } from "../shared/story.js";

export interface Triage {
  triageSeverity: AlertTier;
  suppressed: boolean;
}

/** Derives triage severity and suppression from the raw feed alerts.
 *
 * @param hazardType Raw hazard code (EQ, TC, FL, …). Tier-based suppression
 *   (ADR-0008) applies to earthquakes only — see file header. */
export function assignTriage(
  gdacsAlert: string | null,
  pagerAlert: string | null,
  hazardType: string,
): Triage {
  const triageSeverity = maxTier(toTier(gdacsAlert), toTier(pagerAlert));
  const isEq = hazardType.toUpperCase() === "EQ";
  // Earthquakes: Green-tier or no alert at all -> suppressed from the report
  // body (ADR-0008). Non-EQ hazards are never tier-suppressed — a Green-alert
  // flood is a real signal, not background seismicity.
  const suppressed = isEq && TIER_RANK[triageSeverity] <= TIER_RANK.green;
  return { triageSeverity, suppressed };
}