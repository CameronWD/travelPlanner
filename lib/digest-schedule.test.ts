import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DIGEST_CRON_UTC_HOURS,
  MORNING_WINDOW_LOCAL_HOURS,
  EVENING_WINDOW_LOCAL_HOURS,
  servedSlotsForZone,
  slotForZone,
} from "./digest-schedule";

/**
 * The cron schedule and the route's local-hour windows are one contract split
 * across two files, and nothing but prose used to hold them together: editing
 * either side alone produced a dispatcher that ran on time and reached nobody,
 * with no failing test and no log line saying so. That is exactly how
 * Australia/Brisbane (UTC+10, no daylight saving, ever) came within a commit of
 * shipping with a morning Digest and never the 8pm one — which is the product.
 *
 * So: read the real YAML, and evaluate the real `slotForZone` at each scheduled
 * hour. Nothing here re-hardcodes a window boundary; if the constants move, the
 * assertions move with them and only the *coverage* claim is under test.
 */

const WORKFLOW = path.join(
  __dirname,
  "..",
  ".github",
  "workflows",
  "reminders-cron.yml",
);

/** The UTC hours the workflow's `schedule:` actually fires at. */
function scheduledUtcHours(): number[] {
  const yaml = readFileSync(WORKFLOW, "utf8");
  const hours = new Set<number>();

  for (const line of yaml.split("\n")) {
    // Only real schedule entries — a commented-out example must not count.
    const match = /^\s*-\s*cron:\s*["']([^"']+)["']/.exec(line);
    if (!match) continue;
    const [minute, hourField] = match[1].trim().split(/\s+/);
    expect(minute, "the cron minute should be a fixed minute, not a range").toMatch(
      /^\d+$/,
    );
    for (const part of hourField.split(",")) {
      expect(part, `unsupported cron hour field "${hourField}"`).toMatch(/^\d+$/);
      hours.add(Number(part));
    }
  }

  return [...hours].sort((a, b) => a - b);
}

/**
 * Two instants on opposite sides of southern-hemisphere daylight saving, so a
 * schedule that only works in December cannot pass. Day-of-month is arbitrary;
 * only the month matters.
 */
const INSTANTS = [
  { label: "December (AEDT, CET)", year: 2026, month: 11, day: 15 },
  { label: "July (AEST, CEST)", year: 2026, month: 6, day: 15 },
] as const;

/** The zones the deployment commits to serving (ADR 0008: Brisbane ↔ Europe). */
const SERVED_ZONES = [
  "Australia/Brisbane",
  "Australia/Sydney",
  "Europe/Vienna",
] as const;

function slotsHit(zone: string, instant: (typeof INSTANTS)[number]): Set<string> {
  const slots = new Set<string>();
  for (const hour of scheduledUtcHours()) {
    const at = new Date(Date.UTC(instant.year, instant.month, instant.day, hour, 0, 0));
    const slot = slotForZone(at, zone);
    if (slot) slots.add(slot);
  }
  return slots;
}

describe("the cron schedule against the Digest windows", () => {
  it("reads a schedule out of the workflow at all", () => {
    const hours = scheduledUtcHours();
    expect(hours.length).toBeGreaterThan(0);
    for (const hour of hours) {
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
    }
  });

  for (const zone of SERVED_ZONES) {
    for (const instant of INSTANTS) {
      it(`gives ${zone} both a morning and an evening run in ${instant.label}`, () => {
        const slots = slotsHit(zone, instant);
        expect(
          [...slots].sort(),
          `no scheduled UTC hour lands in a Digest window for ${zone}. ` +
            "Add the missing hour to .github/workflows/reminders-cron.yml.",
        ).toEqual(["EVENING", "MORNING"]);
      });
    }
  }

  it("exports the same UTC hours the workflow fires at", () => {
    // The constant is what a running surface reads to answer "will this device
    // ever be reached?" (lib/digest-schedule.ts, the Settings panel). If it
    // drifts from the YAML, that answer is confidently wrong.
    expect([...DIGEST_CRON_UTC_HOURS].sort((a, b) => a - b)).toEqual(
      scheduledUtcHours(),
    );
  });

  it("does not reach a half-hour zone today — but would with one more cron hour", () => {
    // docs/DEPLOY.md §5 used to claim a half-hour zone "would additionally need
    // the window logic itself to change". It would not: slotForZone reads the
    // local HOUR, so 15:00Z is 20:30 in Asia/Kolkata and 20:45 in
    // Asia/Kathmandu — both inside the evening window already. The limitation
    // is the hour list, not the code, and a maintainer who believes otherwise
    // rewrites working logic.
    for (const zone of ["Asia/Kolkata", "Asia/Kathmandu"]) {
      for (const instant of INSTANTS) {
        expect(slotsHit(zone, instant).size).toBe(0);

        const at = new Date(
          Date.UTC(instant.year, instant.month, instant.day, 15, 0, 0),
        );
        expect(slotForZone(at, zone)).toBe("EVENING");
      }
    }
  });

  it("reports the slots a zone is actually served in, for the day in question", () => {
    // What the Settings panel warns from. December: New York is on EST and no
    // scheduled hour lands anywhere near its morning or evening — the device is
    // considered on every run and reached never, which is invisible without
    // this. July it is on EDT and 10:00Z becomes 06:00 local, a morning run
    // only — still no evening Digest, which is the part people notice.
    const december = new Date(Date.UTC(2026, 11, 15, 12));
    const july = new Date(Date.UTC(2026, 6, 15, 12));

    expect([...servedSlotsForZone(december, "America/New_York")]).toEqual([]);
    expect([...servedSlotsForZone(july, "America/New_York")]).toEqual(["MORNING"]);

    for (const zone of SERVED_ZONES) {
      expect(
        [...servedSlotsForZone(december, zone)].sort(),
        `${zone} is a zone the deployment commits to serving`,
      ).toEqual(["EVENING", "MORNING"]);
      expect([...servedSlotsForZone(july, zone)].sort()).toEqual([
        "EVENING",
        "MORNING",
      ]);
    }
  });

  it("keeps the two windows disjoint and three hours wide", () => {
    // slotForZone tests EVENING first, so an overlap would silently shadow a
    // morning hour rather than fail anywhere visible.
    const overlap = MORNING_WINDOW_LOCAL_HOURS.filter((h) =>
      EVENING_WINDOW_LOCAL_HOURS.includes(h),
    );
    expect(overlap).toEqual([]);
    expect(MORNING_WINDOW_LOCAL_HOURS.length).toBe(3);
    expect(EVENING_WINDOW_LOCAL_HOURS.length).toBe(3);
  });

  it("resolves each window's own hours to its own slot", () => {
    // Anchored in UTC so the local hour is the UTC hour.
    for (const hour of MORNING_WINDOW_LOCAL_HOURS) {
      expect(slotForZone(new Date(Date.UTC(2026, 11, 15, hour)), "UTC")).toBe("MORNING");
    }
    for (const hour of EVENING_WINDOW_LOCAL_HOURS) {
      expect(slotForZone(new Date(Date.UTC(2026, 11, 15, hour)), "UTC")).toBe("EVENING");
    }
    expect(slotForZone(new Date(Date.UTC(2026, 11, 15, 12)), "UTC")).toBeNull();
  });
});
