import { describe, expect, it } from "vitest";
import { createFeedbackNoteSchema } from "@/lib/validations/feedback";

const valid = {
  clientKey: "fk_abc123",
  body: "  The budget total looks wrong after marking paid  ",
  route: "/trips/t1/budget",
  pageLabel: "Budget",
  tripId: "t1",
  tripName: "Europe Summer 2026",
  viewport: "390x844",
  userAgent: "Mozilla/5.0 (iPhone)",
  authoredAt: "2026-09-08T04:05:06.000Z",
};

describe("createFeedbackNoteSchema", () => {
  it("accepts a full note and trims the body", () => {
    const parsed = createFeedbackNoteSchema.parse(valid);
    expect(parsed.body).toBe("The budget total looks wrong after marking paid");
  });

  it("accepts a note written outside any trip", () => {
    const parsed = createFeedbackNoteSchema.parse({
      ...valid,
      tripId: null,
      tripName: null,
    });
    expect(parsed.tripId).toBeNull();
  });

  it("rejects an empty body", () => {
    const result = createFeedbackNoteSchema.safeParse({ ...valid, body: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a body over 4000 characters", () => {
    const result = createFeedbackNoteSchema.safeParse({
      ...valid,
      body: "x".repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing clientKey", () => {
    const result = createFeedbackNoteSchema.safeParse({ ...valid, clientKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an authoredAt that is not a parseable timestamp", () => {
    const result = createFeedbackNoteSchema.safeParse({
      ...valid,
      authoredAt: "last tuesday",
    });
    expect(result.success).toBe(false);
  });
});
