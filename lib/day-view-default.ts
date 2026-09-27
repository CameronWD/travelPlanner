/**
 * Which day "Days" opens when no date was picked (spec 2026-09-27 decision 3):
 * today (in the trip's zone) while the Trip is underway, otherwise the first
 * day. A date-less Trip has no days at all → null (the caller sends the
 * Traveller to the Plan instead).
 */
export function defaultDayISO(input: {
  startDate: string | null;
  endDate: string | null;
  today: string;
}): string | null {
  const { startDate, endDate, today } = input;
  if (!startDate || !endDate) return null;
  if (today >= startDate && today <= endDate) return today;
  return startDate;
}
