/**
 * Pure helpers for the public share view and the settings share-links panel.
 *
 * A ShareScope is one link's three dials (ADR 0051). The floor beneath the
 * dials — money, notes, confirmations, booking refs never shared — is not
 * modelled here because no scope can express it: the public page simply
 * never queries those fields.
 */

export interface ShareScope {
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
}

const DIAL_LABELS: Array<[keyof ShareScope, string]> = [
  ["includeAccommodation", "Accommodation"],
  ["includeTransport", "Transport"],
  ["includeDailyPlans", "Daily plans"],
];

/** Human caption for a link row in Settings. */
export function scopeCaption(scope: ShareScope): string {
  const on = DIAL_LABELS.filter(([key]) => scope[key]).map(([, label]) => label);
  if (on.length === DIAL_LABELS.length) return "Full itinerary";
  if (on.length === 0) return "Route & dates only";
  return ["Route & dates", ...on].join(" · ");
}

/**
 * The accommodation covering tonight: you sleep there on `todayISO` when
 * checkIn <= today < checkOut. On a changeover day two stays can both match
 * the calendar (you check out of one and into the other); the latest check-in
 * is where you actually sleep.
 */
export function tonightsStay<A extends { checkIn: string; checkOut: string }>(
  accommodations: A[],
  todayISO: string,
): A | null {
  const covering = accommodations.filter(
    (a) => a.checkIn <= todayISO && todayISO < a.checkOut,
  );
  if (covering.length === 0) return null;
  return covering.reduce((latest, a) => (a.checkIn > latest.checkIn ? a : latest));
}
