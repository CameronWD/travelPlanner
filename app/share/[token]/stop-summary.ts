export interface StopSummaryInput {
  stays: { name: string; checkIn: string }[];
  plans: number;
  includeAccommodation: boolean;
  includeDailyPlans: boolean;
  country: string | null;
}

/** The closed Stop card's line, from only what this link's switches allow. */
export function stopSummary({ stays, plans, includeAccommodation, includeDailyPlans, country }: StopSummaryInput): string | null {
  const parts: string[] = [];
  if (includeAccommodation && stays.length > 0) {
    const [first, ...rest] = [...stays].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    parts.push(rest.length > 0 ? `${first.name} +${rest.length}` : first.name);
  }
  if (includeDailyPlans && plans > 0) parts.push(`${plans} ${plans === 1 ? "plan" : "plans"}`);
  if (country) parts.push(country);
  return parts.length > 0 ? parts.join(" · ") : null;
}
