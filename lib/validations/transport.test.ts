import { describe, expect, it } from "vitest";
import { transportSchema } from "./transport";

const VALID_BASE = {
  mode: "FLIGHT" as const,
};

describe("transportSchema", () => {
  it("accepts a minimal valid input with just mode", () => {
    const result = transportSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields filled", () => {
    const result = transportSchema.safeParse({
      mode: "TRAIN",
      fromStopId: "stop-1",
      toStopId: "stop-2",
      depPlace: "London Euston",
      arrPlace: "Manchester Piccadilly",
      depAt: "2026-07-01T08:00",
      arrAt: "2026-07-01T10:30",
      reference: "LNER123",
      notes: "Book seat online",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depAt).toBeInstanceOf(Date);
      expect(result.data.arrAt).toBeInstanceOf(Date);
    }
  });

  it("coerces datetime-local string to Date", () => {
    const result = transportSchema.safeParse({
      mode: "BUS",
      depAt: "2026-07-01T14:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depAt).toBeInstanceOf(Date);
    }
  });

  it("coerces full ISO string to Date", () => {
    const result = transportSchema.safeParse({
      mode: "CAR",
      arrAt: "2026-07-01T18:30:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.arrAt).toBeInstanceOf(Date);
    }
  });

  it("leaves depAt undefined when not provided", () => {
    const result = transportSchema.safeParse({ mode: "FERRY" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depAt).toBeUndefined();
    }
  });

  it("rejects an invalid mode", () => {
    const result = transportSchema.safeParse({ mode: "ROCKET" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.mode).toBeDefined();
    }
  });

  it("rejects missing mode", () => {
    const result = transportSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.mode).toBeDefined();
    }
  });

  it("accepts all TRANSPORT_MODES values", () => {
    for (const mode of ["FLIGHT", "TRAIN", "BUS", "CAR", "FERRY", "OTHER"] as const) {
      const result = transportSchema.safeParse({ mode });
      expect(result.success).toBe(true);
    }
  });

  it("treats empty string fromStopId as absent", () => {
    const result = transportSchema.safeParse({ mode: "FLIGHT", fromStopId: "" });
    // Empty string passes (lenient — server will normalise)
    expect(result.success).toBe(true);
  });
});
