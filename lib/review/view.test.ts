import type { Route } from "next";
import { describe, expect, it } from "vitest";
import { REVIEW_MESSAGES } from "./messages";
import {
  FINDING_CATEGORY_LABELS, REVIEW_KIND_LABELS, findingHref, findingStateLabel, formatReviewDay, formatReviewWhen,
  failedReviewText, groupFindings, homeReviewLine, reviewByLine, reviewingLine, sourceLink, suggestedFixLabel, toFindingCard, toHistoryRow,
  type FindingCard, type FindingForView, type ReviewForView,
} from "./view";

const CAM = { id: "u1", name: "Cam Williams", image: null };
const FORMER = { id: null, name: "a former Traveller" };
// 2026-10-18T04:05Z is Sunday 18 Oct, 14:05 in Brisbane (UTC+10, no DST).
const AT = new Date("2026-10-18T04:05:00Z");
const BNE = "Australia/Brisbane";

// R's categories are the eight UPPERCASE values (R8, no "flag": each Flag
// restates onto one of the eight, R decision 2).
const finding = (o: Partial<FindingForView> = {}): FindingForView => ({
  id: "f1", severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "i1", date: "2026-12-08",
  title: "Kaiserburg is closed on Tuesdays", detail: "Winter hours: closed Tue.", suggestedFix: null, source: null,
  state: "OPEN", stateAt: null, stateBy: null, canApply: false, canDismiss: false, canUndo: false, ...o,
});

describe("labels", () => {
  it("names both kinds and every category", () => {
    expect(REVIEW_KIND_LABELS).toEqual({ STANDARD: "Standard Review", DEEP: "Deep Review" });
    for (const label of Object.values(FINDING_CATEGORY_LABELS)) expect(label).toMatch(/^[A-Z]/);
  });
});

describe("formatReviewDay / formatReviewWhen", () => {
  it("formats in the given zone", () => {
    expect(formatReviewDay(AT, BNE)).toBe("18 Oct");
    expect(formatReviewWhen(AT, BNE)).toBe("Sun 18 Oct, 14:05");
    expect(formatReviewWhen(AT, "UTC")).toBe("Sun 18 Oct, 04:05");
  });
  it("falls back to UTC for a bad zone", () => {
    expect(formatReviewWhen(AT, "Not/AZone")).toBe("Sun 18 Oct, 04:05");
  });
});

describe("findingStateLabel (R10)", () => {
  it("Open, Applied/Dismissed by whom and when, No longer found", () => {
    expect(findingStateLabel(finding(), BNE)).toBe("Open");
    expect(findingStateLabel(finding({ state: "APPLIED", stateBy: CAM, stateAt: AT }), BNE)).toBe("Applied by Cam, 18 Oct");
    expect(findingStateLabel(finding({ state: "DISMISSED", stateBy: CAM, stateAt: AT }), BNE)).toBe("Dismissed by Cam, 18 Oct");
    expect(findingStateLabel(finding({ state: "DISMISSED" }), BNE)).toBe("Dismissed");
    expect(findingStateLabel(finding({ state: "GONE" }), BNE)).toBe("No longer found");
  });
  it("a former Traveller is shown whole, never split to its first word", () => {
    expect(findingStateLabel(finding({ state: "APPLIED", stateBy: FORMER, stateAt: AT }), BNE)).toBe("Applied by a former Traveller, 18 Oct");
  });
});

describe("suggestedFixLabel", () => {
  it("describes each kind in plain words", () => {
    expect(suggestedFixLabel({ kind: "item.times", itemId: "i1", startTime: "10:00", endTime: "12:00", date: "2026-12-09" })).toBe("Change to 10:00–12:00 on 9 Dec");
    expect(suggestedFixLabel({ kind: "item.times", itemId: "i1", startTime: "10:00" })).toBe("Change the start to 10:00");
    expect(suggestedFixLabel({ kind: "item.bookingState", id: "i1", bookingState: "TO_BOOK", bookBy: "2026-11-01" })).toBe("Mark as to book, by 1 Nov");
    expect(suggestedFixLabel({ kind: "transport.bookingState", id: "t1", bookingState: "BOOKED" })).toBe("Mark as booked");
    expect(suggestedFixLabel({ kind: "accommodation.bookingState", id: "a1", bookingState: "NONE" })).toBe("Mark as no booking needed");
    expect(suggestedFixLabel({ kind: "item.openingHours", itemId: "i1", hours: { week: {}, seasons: [], closed: [] } })).toBe("Add the opening hours");
    // Final wave M6: the Item already has hours.
    expect(suggestedFixLabel({ kind: "item.openingHours", itemId: "i1", hours: { week: {}, seasons: [], closed: [] } }, { replacesHours: true })).toBe("Replace the opening hours");
    expect(suggestedFixLabel({ kind: "item.note", itemId: "i1", append: "Closed 24 Dec." })).toBe("Add to the note: Closed 24 Dec.");
    expect(suggestedFixLabel({ kind: "checklist.add", list: "PACKING", text: "Umbrella" })).toBe("Add to the packing list: Umbrella");
    expect(suggestedFixLabel({ kind: "checklist.add", list: "PRETRIP", text: "Buy the 3-day Kansai pass" })).toBe("Add to the pre-trip checklist: Buy the 3-day Kansai pass");
  });
});

describe("findingHref", () => {
  const base = "/trips/xmas";
  it("an Item or a day opens its day; a Stop opens on the plan; the Trip has no link", () => {
    expect(findingHref(finding(), base)).toBe("/trips/xmas/day/2026-12-08");
    expect(findingHref(finding({ targetType: "DAY", targetId: null }), base)).toBe("/trips/xmas/day/2026-12-08");
    expect(findingHref(finding({ targetType: "STOP", targetId: "s 1", date: null }), base)).toBe("/trips/xmas/plan?stop=s%201");
    expect(findingHref(finding({ targetType: "TRANSPORT", targetId: "t1", date: null }), base)).toBe("/trips/xmas/plan");
    expect(findingHref(finding({ targetType: "TRIP", targetId: null, date: null }), base)).toBeNull();
  });
});

describe("sourceLink", () => {
  it("keeps http(s) only, and shows the host", () => {
    expect(sourceLink("https://www.kaiserburg-nuernberg.de/en/hours")).toEqual({ href: "https://www.kaiserburg-nuernberg.de/en/hours", host: "kaiserburg-nuernberg.de" });
    expect(sourceLink("javascript:alert(1)")).toBeNull();
    expect(sourceLink("not a url")).toBeNull();
    expect(sourceLink(null)).toBeNull();
  });
});

describe("toFindingCard + groupFindings", () => {
  const ctx = { base: "/trips/xmas", timeZone: BNE };
  it("builds a serialisable card, passing R's canApply/canDismiss/canUndo straight through", () => {
    const card = toFindingCard(
      finding({ suggestedFix: { kind: "item.bookingState", id: "i1", bookingState: "BOOKED" }, source: "https://example.com/x", canApply: true, canDismiss: true, canUndo: false }),
      ctx,
    );
    expect(card).toEqual({
      id: "f1", severity: "warning", categoryLabel: FINDING_CATEGORY_LABELS.CLOSURE,
      title: "Kaiserburg is closed on Tuesdays", detail: "Winter hours: closed Tue.",
      source: { href: "https://example.com/x", host: "example.com" },
      state: "OPEN", stateLabel: "Open", fixLabel: "Mark as booked", href: "/trips/xmas/day/2026-12-08" as Route,
      canApply: true, canDismiss: true, canUndo: false,
    } satisfies FindingCard);
  });
  it("an opening-hours fix on an Item that already has hours reads Replace (final wave M6)", () => {
    const hours = { kind: "item.openingHours" as const, itemId: "i1", hours: { week: {}, seasons: [], closed: [] } };
    expect(toFindingCard(finding({ suggestedFix: hours, replacesHours: true }), ctx).fixLabel).toBe("Replace the opening hours");
    expect(toFindingCard(finding({ suggestedFix: hours }), ctx).fixLabel).toBe("Add the opening hours");
  });
  it("warnings first, then notes; inside each, Open before Applied, Dismissed, No longer found; empty groups dropped", () => {
    const cards = [
      toFindingCard(finding({ id: "a", severity: "info", state: "DISMISSED" }), ctx),
      toFindingCard(finding({ id: "b", severity: "warning", state: "GONE" }), ctx),
      toFindingCard(finding({ id: "c", severity: "warning", state: "OPEN" }), ctx),
      toFindingCard(finding({ id: "d", severity: "info", state: "OPEN" }), ctx),
      toFindingCard(finding({ id: "e", severity: "warning", state: "APPLIED" }), ctx),
    ];
    const groups = groupFindings(cards);
    expect(groups.map((g) => [g.heading, g.cards.map((c) => c.id)])).toEqual([
      ["Warnings", ["c", "e", "b"]],
      ["Notes", ["d", "a"]],
    ]);
    expect(groupFindings(cards.filter((c) => c.severity === "info")).map((g) => g.heading)).toEqual(["Notes"]);
  });
});

describe("reviewingLine (R11)", () => {
  it("names who started it by first name", () => {
    expect(reviewingLine(CAM)).toBe("Reviewing… (started by Cam)");
  });
  it("a former Traveller is shown whole", () => {
    expect(reviewingLine(FORMER)).toBe("Reviewing… (started by a former Traveller)");
  });
});

describe("reviewByLine", () => {
  it("who ran it, and when", () => {
    expect(reviewByLine({ startedBy: CAM, startedAt: AT }, BNE)).toBe("Run by Cam, Sun 18 Oct, 14:05");
  });
});

describe("toHistoryRow (R10: who, when, kind, summary line)", () => {
  const review = (o: Partial<ReviewForView> = {}): ReviewForView => ({
    id: "r1", kind: "DEEP", status: "DONE", summary: "Two closures and a holiday to plan around.",
    startedAt: AT, finishedAt: AT, startedBy: CAM, ...o,
  });
  const ctx = { base: "/trips/xmas", timeZone: BNE, currentId: "r1" };
  it("a finished Review", () => {
    expect(toHistoryRow(review(), ctx)).toEqual({
      id: "r1", href: "/trips/xmas/reviews?review=r1" as Route, kindLabel: "Deep Review", byName: "Cam",
      when: "Sun 18 Oct, 14:05", line: "Two closures and a holiday to plan around.", status: "DONE", current: true,
    });
  });
  it("running, failed, and a finished one with no summary", () => {
    expect(toHistoryRow(review({ status: "RUNNING", summary: null }), ctx).line).toBe("Still running");
    expect(toHistoryRow(review({ status: "FAILED", summary: null }), ctx).line).toBe("Didn't finish");
    // Final wave I2: the stored reason, when there is one.
    expect(toHistoryRow(review({ status: "FAILED", summary: null, error: REVIEW_MESSAGES.busy }), ctx).line)
      .toBe("Didn't finish: Claude was busy, so this Review stopped. Start it again in a few minutes.");
    expect(toHistoryRow(review({ summary: null }), ctx).line).toBe("No summary");
    expect(toHistoryRow(review({ id: "r2" }), ctx).current).toBe(false);
  });
});

describe("failedReviewText (final wave I2)", () => {
  it("names why the shown Review stopped, and that nothing changed", () => {
    expect(failedReviewText(REVIEW_MESSAGES.timeout)).toBe("This Review didn't finish. This Review took too long and stopped. Nothing on the trip was changed.");
    expect(failedReviewText(null)).toBe("This Review didn't finish. Nothing on the trip was changed.");
  });
  it("no em-dash in any reason it can show", () => {
    for (const m of Object.values(REVIEW_MESSAGES)) expect(failedReviewText(m)).not.toContain("\u2014");
  });
});

describe("homeReviewLine (R10: Home shows 'N open from the <date> review')", () => {
  const ctx = { base: "/trips/xmas", timeZone: BNE };
  // The count comes from the reads (lib/review-reads.ts latestReviewOpenCount): the latest DONE Review only.
  const done = (openCount: number) => ({ startedAt: AT, openCount });
  it("the latest finished Review's Open count", () => {
    expect(homeReviewLine(done(2), ctx)).toEqual({ text: "2 open from the 18 Oct review", href: "/trips/xmas/reviews" as Route });
    expect(homeReviewLine(done(1), ctx)?.text).toBe("1 open from the 18 Oct review");
  });
  it("nothing when there is no finished Review, or nothing is open", () => {
    expect(homeReviewLine(null, ctx)).toBeNull();
    expect(homeReviewLine(done(0), ctx)).toBeNull();
  });
});
