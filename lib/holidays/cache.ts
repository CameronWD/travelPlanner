import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { GOOGLE_TIMEOUT_MS } from "@/lib/google-fetch";
import { HOLIDAY_FEED_NAMES } from "./feed-names";
import { parseHolidayIcs, type FeedHoliday } from "./ics";

const OK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 24 * 60 * 60 * 1000;

function feedUrl(name: string): string {
  return `https://calendar.google.com/calendar/ical/en.${name}%23holiday%40group.v.calendar.google.com/public/basic.ics`;
}

function normalise(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean))];
}

export async function readHolidayFeeds(countryCodes: string[]): Promise<Map<string, FeedHoliday[]>> {
  const codes = normalise(countryCodes);
  const feeds = new Map<string, FeedHoliday[]>();
  if (codes.length === 0) return feeds;
  const rows = await db.holidayFeed.findMany({ where: { countryCode: { in: codes } } });
  for (const row of rows) {
    const holidays = row.holidays as FeedHoliday[];
    if (holidays.length > 0) feeds.set(row.countryCode, holidays);
  }
  return feeds;
}

async function fetchFeed(name: string): Promise<FeedHoliday[] | null> {
  try {
    const res = await fetch(feedUrl(name), { signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    if (res.status !== 200) return null;
    const parsed = parseHolidayIcs(await res.text());
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function isDue(code: string, row: { status: string; fetchedAt: Date } | undefined, now: Date): boolean {
  if (!row) return true;
  const age = now.getTime() - row.fetchedAt.getTime();
  if (row.status === "OK") return age > OK_MAX_AGE_MS;
  if (row.status === "ERROR") return age > ERROR_RETRY_MS;
  return Boolean(HOLIDAY_FEED_NAMES[code]);
}

async function refreshOne(code: string, now: Date, kept: unknown): Promise<void> {
  const name = HOLIDAY_FEED_NAMES[code];
  const holidays = name ? await fetchFeed(name) : [];
  const status = !name ? "NONE" : holidays ? "OK" : "ERROR";
  const data = { status, holidays: holidays ?? kept ?? [], fetchedAt: now };
  await db.holidayFeed.upsert({ where: { countryCode: code }, create: { countryCode: code, ...data }, update: data });
}

export async function refreshHolidayFeeds(countryCodes: string[], now: Date = new Date()): Promise<void> {
  const codes = normalise(countryCodes);
  if (codes.length === 0) return;
  const rows = await db.holidayFeed.findMany({ where: { countryCode: { in: codes } } });
  const byCode = new Map(rows.map((r) => [r.countryCode, r]));
  const due = codes.filter((c) => isDue(c, byCode.get(c), now));
  await Promise.all(
    due.map((c) =>
      refreshOne(c, now, byCode.get(c)?.holidays).catch((err) =>
        console.error(`[holidays] refresh failed for ${c}:`, err instanceof Error ? err.message : String(err)),
      ),
    ),
  );
}

export function scheduleHolidayFeeds(countryCodes: string[]): void {
  try {
    after(() => refreshHolidayFeeds(countryCodes));
  } catch {
    // Outside a request (a script, a test) there is nothing to defer to.
  }
}
