import { describe, it, expect } from "vitest";
import { selectDueReminders } from "@/lib/reminders";

const NOW = new Date("2026-06-21T12:00:00Z");

function makeReminder(
  fireAt: string,
  sent: boolean,
): { fireAt: Date; sent: boolean; id: string } {
  return { id: "r-" + fireAt, fireAt: new Date(fireAt), sent };
}

describe("selectDueReminders", () => {
  it("returns reminders where fireAt <= now and sent = false", () => {
    const due = makeReminder("2026-06-21T11:00:00Z", false);
    const result = selectDueReminders([due], NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(due);
  });

  it("excludes reminders where fireAt is exactly now (boundary — included)", () => {
    const exact = makeReminder("2026-06-21T12:00:00Z", false);
    const result = selectDueReminders([exact], NOW);
    expect(result).toHaveLength(1);
  });

  it("excludes reminders where fireAt > now (not yet due)", () => {
    const future = makeReminder("2026-06-21T13:00:00Z", false);
    const result = selectDueReminders([future], NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes reminders already sent", () => {
    const alreadySent = makeReminder("2026-06-21T10:00:00Z", true);
    const result = selectDueReminders([alreadySent], NOW);
    expect(result).toHaveLength(0);
  });

  it("handles a mix correctly", () => {
    const reminders = [
      makeReminder("2026-06-21T09:00:00Z", false), // due ✓
      makeReminder("2026-06-21T09:00:00Z", true), // already sent ✗
      makeReminder("2026-06-21T15:00:00Z", false), // future ✗
      makeReminder("2026-06-21T11:30:00Z", false), // due ✓
    ];
    const result = selectDueReminders(reminders, NOW);
    expect(result).toHaveLength(2);
    expect(result.every((r) => !r.sent)).toBe(true);
    expect(result.every((r) => r.fireAt <= NOW)).toBe(true);
  });

  it("returns an empty array when there are no reminders", () => {
    expect(selectDueReminders([], NOW)).toEqual([]);
  });

  it("preserves original objects (identity, not clones)", () => {
    const r = makeReminder("2026-06-20T00:00:00Z", false);
    const result = selectDueReminders([r], NOW);
    expect(result[0]).toBe(r);
  });
});
