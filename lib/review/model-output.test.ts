import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ReviewTargets } from "./input-shape";
import { findingKey } from "./key";
import { MAX_MODEL_FINDINGS, mergeDrafts, parseReviewOutput, reviewOutputSchema, reviewSummary, toFindingDrafts, type ReviewOutput } from "./model-output";
import type { FindingDraft, SuggestedFix } from "./types";

const TARGETS: ReviewTargets = {
  STOP: new Set(["kyoto"]),
  ITEM: new Set(["museum", "kiyomizu"]),
  TRANSPORT: new Set(["train"]),
  ACCOMMODATION: new Set(["ryokan"]),
};
type ModelFinding = ReviewOutput["findings"][number];
const finding = (over: Partial<ModelFinding> = {}): ModelFinding => ({
  severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "museum", date: "2026-11-02",
  title: "The museum is closed on Mondays", detail: "Kyoto National Museum closes every Monday. Move the visit to Tuesday.",
  source: "https://www.kyohaku.go.jp/eng/visit/", suggestedFix: null, ...over,
});
const out = (...findings: ModelFinding[]): ReviewOutput => ({ summary: "Two things to check.", findings });

describe("reviewOutputSchema as a strict tool schema", () => {
  it("is a closed object whose every field is required, and still tells Claude the allowed values", () => {
    const schema = zodOutputFormat(reviewOutputSchema).schema as { type: string; required: string[]; additionalProperties: boolean };
    expect(schema).toMatchObject({ type: "object", required: ["summary", "findings"], additionalProperties: false });
    // SDK 0.105's transform moves enum values into descriptions (lib/transform-json-schema.js): Claude reads them; zod enforces them.
    expect(JSON.stringify(schema)).toContain("item.times");
    expect(JSON.stringify(schema)).toContain("STALE_NOTE");
  });

  it("refuses a category the model may not use, such as a restated Flag", () => {
    expect(reviewOutputSchema.safeParse(out({ ...finding(), category: "flag" as never })).success).toBe(false);
  });
});

describe("reviewOutputSchema trims what Claude supplies (keys are compared exactly)", () => {
  it("trims ids, dates, titles and the summary, and reads enum values whatever their case or padding", () => {
    const raw = {
      summary: "  One thing.  ",
      findings: [{
        severity: " Warning ", category: " closure ", targetType: " item ", targetId: " museum ", date: " 2026-11-02 ",
        title: "  Closed on Mondays  ", detail: " Move it. ", source: " https://www.kyohaku.go.jp/eng/visit/ ",
        suggestedFix: { kind: " item.times ", itemId: "  museum ", startTime: " ", endTime: null, date: " 2026-11-03 " },
      }],
    };
    const parsed = reviewOutputSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.summary).toBe("One thing.");
    expect(parsed.data.findings[0]).toMatchObject({ severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "museum", date: "2026-11-02", title: "Closed on Mondays", detail: "Move it." });
    const [d] = toFindingDrafts(parsed.data, TARGETS);
    expect(findingKey(d)).toBe(findingKey(toFindingDrafts(out(finding()), TARGETS)[0]));
    expect(d.suggestedFix).toEqual({ kind: "item.times", itemId: "museum", date: "2026-11-03" });
  });
});

describe("parseReviewOutput (notes decision 8: drop what is bad, keep the run)", () => {
  it("keeps a Finding whose fix is malformed, with no fix (Dismiss only)", () => {
    const raw = { summary: "One thing.", findings: [{ ...finding(), suggestedFix: { kind: "item.teleport", itemId: "museum" } }] };
    const parsed = parseReviewOutput(raw);
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0]).toMatchObject({ title: "The museum is closed on Mondays", suggestedFix: null });
  });

  it("drops an invalid Finding (bad category, missing title) and keeps the others", () => {
    const { title: _title, ...untitled } = finding();
    void _title;
    const raw = { summary: "Two things.", findings: [finding(), { ...finding(), category: "weather" }, untitled, finding({ category: "TICKET" })] };
    const parsed = parseReviewOutput(raw);
    expect(parsed?.findings.map((f) => f.category)).toEqual(["CLOSURE", "TICKET"]);
    expect(parsed?.summary).toBe("Two things.");
  });

  it("keeps a summary with no Findings, and is unreadable with neither", () => {
    expect(parseReviewOutput({ summary: "Nothing to change.", findings: [] })).toEqual({ summary: "Nothing to change.", findings: [] });
    expect(parseReviewOutput({ summary: "  ", findings: [{ category: "weather" }] })).toBeNull();
    expect(parseReviewOutput({ findings: [] })).toBeNull();
    expect(parseReviewOutput("not an object")).toBeNull();
    expect(parseReviewOutput(null)).toBeNull();
  });

  it("the tool schema still shows suggestedFix as the fix kinds or null", () => {
    const schema = zodOutputFormat(reviewOutputSchema).schema as { properties: { findings: { items: { properties: Record<string, unknown>; required: string[] } } } };
    const item = schema.properties.findings.items;
    expect(item.required).toContain("suggestedFix");
    expect(JSON.stringify(item.properties.suggestedFix)).toContain("item.openingHours");
    expect(JSON.stringify(item.properties.suggestedFix)).toContain('"null"');
  });
});

describe("toFindingDrafts (spec 2026-10-17 R8)", () => {
  it("keeps a Finding on a visible target as it came, origin MODEL", () => {
    expect(toFindingDrafts(out(finding()), TARGETS)).toEqual<FindingDraft[]>([{
      severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "museum", date: "2026-11-02",
      title: "The museum is closed on Mondays", detail: "Kyoto National Museum closes every Monday. Move the visit to Tuesday.",
      source: "https://www.kyohaku.go.jp/eng/visit/", origin: "MODEL",
    }]);
  });

  it("points a Finding about an unknown or hidden id at the Trip, keeping its date", () => {
    const [d] = toFindingDrafts(out(finding({ targetId: "gift" })), TARGETS);
    expect(d).toMatchObject({ targetType: "TRIP", date: "2026-11-02" });
    expect(d).not.toHaveProperty("targetId");
  });

  it("needs a date for a DAY Finding, and ignores a malformed one", () => {
    expect(toFindingDrafts(out(finding({ targetType: "DAY", targetId: null, date: "2026-11-03" })), TARGETS)[0]).toMatchObject({ targetType: "DAY", date: "2026-11-03" });
    const [noDate] = toFindingDrafts(out(finding({ targetType: "DAY", targetId: null, date: "3 Nov" })), TARGETS);
    expect(noDate.targetType).toBe("TRIP");
    expect(noDate).not.toHaveProperty("date");
  });

  it("keeps only a web address as the source", () => {
    expect(toFindingDrafts(out(finding({ source: "javascript:alert(1)" })), TARGETS)[0]).not.toHaveProperty("source");
    expect(toFindingDrafts(out(finding({ source: null })), TARGETS)[0]).not.toHaveProperty("source");
  });

  it("turns each fix kind into R's SuggestedFix", () => {
    const fixes: Array<[ModelFinding["suggestedFix"], SuggestedFix]> = [
      [{ kind: "item.times", itemId: "museum", startTime: null, endTime: null, date: "2026-11-03" }, { kind: "item.times", itemId: "museum", date: "2026-11-03" }],
      [{ kind: "transport.bookingState", id: "train", bookingState: "TO_BOOK", bookBy: "2026-10-25" }, { kind: "transport.bookingState", id: "train", bookingState: "TO_BOOK", bookBy: "2026-10-25" }],
      [{ kind: "accommodation.bookingState", id: "ryokan", bookingState: "BOOKED", bookBy: null }, { kind: "accommodation.bookingState", id: "ryokan", bookingState: "BOOKED" }],
      [{ kind: "item.note", itemId: "kiyomizu", append: "  Culture Day: expect crowds.  " }, { kind: "item.note", itemId: "kiyomizu", append: "Culture Day: expect crowds." }],
      [
        { kind: "item.openingHours", itemId: "museum", week: [{ day: "mon", spans: [] }, { day: "tue", spans: [{ open: "09:30", close: "17:00" }] }], seasons: [], closed: ["2026-12-29"] },
        { kind: "item.openingHours", itemId: "museum", hours: { week: { mon: [], tue: [["09:30", "17:00"]] }, seasons: [], closed: ["2026-12-29"], source: "https://www.kyohaku.go.jp/eng/visit/" } },
      ],
    ];
    for (const [suggestedFix, expected] of fixes) {
      expect(toFindingDrafts(out(finding({ suggestedFix })), TARGETS)[0].suggestedFix).toEqual(expected);
    }
  });

  it("drops a fix on an id it may not touch, of the wrong type, empty, or invalid, but keeps the Finding (Dismiss only)", () => {
    const dropped: ModelFinding["suggestedFix"][] = [
      { kind: "item.times", itemId: "gift", startTime: "20:00", endTime: null, date: null },
      { kind: "item.bookingState", id: "train", bookingState: "BOOKED", bookBy: null },
      { kind: "item.times", itemId: "museum", startTime: null, endTime: null, date: null },
      { kind: "item.times", itemId: "museum", startTime: "25:99", endTime: null, date: null },
    ];
    for (const suggestedFix of dropped) {
      const drafts = toFindingDrafts(out(finding({ suggestedFix })), TARGETS);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).not.toHaveProperty("suggestedFix");
    }
  });

  it("trims titles and details, skips an empty title, and keeps at most MAX_MODEL_FINDINGS", () => {
    const [d] = toFindingDrafts(out(finding({ title: `  ${"x".repeat(200)} `, detail: "y".repeat(2_000) })), TARGETS);
    expect(d.title).toHaveLength(120);
    expect(d.detail).toHaveLength(1_200);
    expect(toFindingDrafts(out(finding({ title: "   " })), TARGETS)).toEqual([]);
    const many = Array.from({ length: MAX_MODEL_FINDINGS + 5 }, (_, i) => finding({ targetType: "TRIP", targetId: null, title: `T${i}` }));
    expect(toFindingDrafts(out(...many), TARGETS)).toHaveLength(MAX_MODEL_FINDINGS);
  });
});

describe("toFindingDrafts copy and dates", () => {
  it("turns an em-dash in a title or detail into a comma (no em-dashes in the app's copy)", () => {
    const [d] = toFindingDrafts(out(finding({ title: "Closed Mondays — move it", detail: "It closes on Mondays—every week —  all year." })), TARGETS);
    expect(d.title).toBe("Closed Mondays, move it");
    expect(d.detail).toBe("It closes on Mondays, every week, all year.");
  });

  it("ignores an impossible date", () => {
    const [d] = toFindingDrafts(out(finding({ date: "2026-02-30" })), TARGETS);
    expect(d).not.toHaveProperty("date");
    const [day] = toFindingDrafts(out(finding({ targetType: "DAY", targetId: null, date: "2026-13-01" })), TARGETS);
    expect(day.targetType).toBe("TRIP");
  });
});

describe("mergeDrafts", () => {
  it("keeps the first draft per key, so a restated Flag wins over Claude saying the same", () => {
    const flag: FindingDraft = { severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "museum", date: "2026-11-02", title: "Closed that day.", detail: "Closed that day.", origin: "FLAG" };
    const [model] = toFindingDrafts(out(finding()), TARGETS);
    expect(findingKey(model)).toBe(findingKey(flag));
    expect(mergeDrafts([flag], [model])).toEqual([flag]);
    const other = toFindingDrafts(out(finding({ category: "TICKET" })), TARGETS);
    expect(mergeDrafts([flag], other)).toHaveLength(2);
  });
});

describe("reviewSummary", () => {
  it("is Claude's one line, squeezed and capped, or a plain count when it gave none", () => {
    expect(reviewSummary({ summary: "  Two things\n to check.  ", findings: [] }, 2)).toBe("Two things to check.");
    expect(reviewSummary({ summary: "x".repeat(300), findings: [] }, 1)).toHaveLength(200);
    expect(reviewSummary({ summary: "A closure — and a holiday.", findings: [] }, 2)).toBe("A closure, and a holiday.");
    expect(reviewSummary({ summary: " ", findings: [] }, 0)).toBe("Nothing to look at.");
    expect(reviewSummary({ summary: "", findings: [] }, 1)).toBe("1 thing to look at.");
    expect(reviewSummary({ summary: "", findings: [] }, 3)).toBe("3 things to look at.");
  });
});
