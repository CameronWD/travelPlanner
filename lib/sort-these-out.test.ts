import type { Route } from "next";
import { describe, expect, it } from "vitest";
import { sortTheseOut, SORT_ROW_LIMIT_DESKTOP } from "./sort-these-out";
import type { NextStep } from "@/lib/next-steps";
import type { ReminderItem } from "@/server/actions/reminders";

const BASE = "/trips/t1";
const step = (id: string, title: string, extra: Partial<NextStep> = {}): NextStep => ({
  id,
  title,
  href: `${BASE}/plan` as Route,
  severity: "info",
  source: "nudge",
  ...extra,
});
const reminder = (id: string, date: string, extra: Partial<ReminderItem> = {}): ReminderItem => ({
  id,
  title: `Reminder ${id}`,
  date,
  stopId: null,
  stopName: null,
  ...extra,
});

describe("sortTheseOut", () => {
  const today = "2026-12-01";

  it("orders reminders due within 7 days, then transport, then the rest in their order", () => {
    const { rows, total } = sortTheseOut({
      basePath: BASE,
      today,
      steps: [
        step("nudge-packing", "Start your packing list", { subtitle: "Nothing added yet." }),
        step("nudge-unbooked-transport", "Book transport", { kind: "transport" }),
        step("stop-no-accom-s1", "No bed in Paris", { severity: "warning", source: "flag" }),
      ],
      reminders: [reminder("r1", "2026-12-08")],
    });
    expect(rows.map((r) => r.id)).toEqual([
      "reminder-r1",
      "nudge-unbooked-transport",
      "nudge-packing",
      "stop-no-accom-s1",
    ]);
    expect(total).toBe(4);
    expect(rows[0]).toMatchObject({ tone: "coral", icon: "bell", title: "Reminder r1", subtitle: "Due Tue 8 Dec" });
    expect(rows[1]).toMatchObject({ tone: "sun", icon: "plane" });
    expect(rows[2]).toMatchObject({ tone: "teal", icon: "list-checks", subtitle: "Nothing added yet." });
    expect(rows[3]).toMatchObject({ tone: "stone", icon: "circle-alert" });
  });

  it("skips reminders more than 7 days out (and any in the past)", () => {
    const { rows } = sortTheseOut({
      basePath: BASE,
      today,
      steps: [],
      reminders: [reminder("past", "2026-11-30"), reminder("today", "2026-12-01"), reminder("far", "2026-12-09")],
    });
    expect(rows.map((r) => r.id)).toEqual(["reminder-today"]);
  });

  it("links a reminder about a Stop to that Stop on the Plan", () => {
    const { rows } = sortTheseOut({
      basePath: BASE,
      today,
      steps: [],
      reminders: [reminder("r1", "2026-12-02", { stopId: "s9" }), reminder("r2", "2026-12-03")],
    });
    expect(rows[0].href).toBe(`${BASE}/plan#stop-s9`);
    expect(rows[1].href).toBe(`${BASE}/plan`);
  });

  it("gives pre-trip lilac, empty days pink with a day label (never ISO)", () => {
    const { rows } = sortTheseOut({
      basePath: BASE,
      today,
      steps: [
        step("nudge-pretrip", "Add pre-trip to-dos"),
        step("empty-day-2026-12-12", "Nothing scheduled on 2026-12-12.", { source: "flag" }),
      ],
      reminders: [],
    });
    expect(rows[0]).toMatchObject({ tone: "lilac", icon: "clipboard-list" });
    expect(rows[1]).toMatchObject({ tone: "pink", icon: "calendar", title: "Plan Sat 12 Dec", subtitle: "Nothing scheduled that day" });
    expect(rows[1].title).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("caps rows at 4 but counts everything", () => {
    const steps = Array.from({ length: 6 }, (_, i) => step(`s${i}`, `Step ${i}`));
    const { rows, total } = sortTheseOut({ basePath: BASE, today, steps, reminders: [reminder("r", "2026-12-04")] });
    expect(rows).toHaveLength(4);
    expect(total).toBe(7);
  });

  it("caps rows at the default 4, or at the limit given (desktop tile uses 6)", () => {
    const steps = Array.from({ length: 8 }, (_, i) => step(`nudge-${i}`, `Thing ${i}`));
    expect(sortTheseOut({ basePath: BASE, today, steps, reminders: [] }).rows).toHaveLength(4);
    expect(sortTheseOut({ basePath: BASE, today, steps, reminders: [], limit: SORT_ROW_LIMIT_DESKTOP }).rows).toHaveLength(6);
    expect(SORT_ROW_LIMIT_DESKTOP).toBe(6);
  });

  it("shows one teal 'You're all sorted' row when there is nothing to do", () => {
    const { rows, total } = sortTheseOut({ basePath: BASE, today, steps: [], reminders: [] });
    expect(total).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tone: "teal",
      title: "You're all sorted",
      subtitle: "Anything new shows up here",
    });
  });
});
