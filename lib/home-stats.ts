import { nightsBetween } from "@/lib/dates";

export interface HomeStat {
  label: string;
  value: string;
}

/**
 * The desktop Home countdown tile's "at a glance" row (Feedback
 * cmumctx4r000504l7lkixq9us): the shape of the plan, never money or progress.
 * Every stat is omitted rather than shown as 0, so a Trip that is still an
 * idea gets an empty array and no row. Pure.
 */
export function homeStats(i: {
  startDate: string | null;
  endDate: string | null;
  stops: { countryCode: string | null }[];
  chaptersEnabled: boolean;
  chapterCount: number;
}): HomeStat[] {
  const out: HomeStat[] = [];
  const one = (n: number, s: string, p: string) => ({ label: n === 1 ? s : p, value: String(n) });
  if (i.startDate && i.endDate) {
    const nights = nightsBetween(i.startDate, i.endDate);
    if (nights > 0) out.push(one(nights, "Night", "Nights"));
  }
  if (i.stops.length > 0) out.push(one(i.stops.length, "Stop", "Stops"));
  const countries = new Set(i.stops.map((s) => s.countryCode).filter((c): c is string => !!c)).size;
  if (countries > 0) out.push(one(countries, "Country", "Countries"));
  if (i.chaptersEnabled && i.chapterCount > 0) out.push(one(i.chapterCount, "Chapter", "Chapters"));
  return out;
}
