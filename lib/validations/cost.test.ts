import { describe, expect, it } from "vitest";
import { costSchema } from "./cost";

// ---------------------------------------------------------------------------
// Valid cases
// ---------------------------------------------------------------------------

describe("costSchema — valid entity cost (TRANSPORT)", () => {
  it("accepts a valid TRANSPORT cost with all fields", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 5000,
      actualMinor: 4850,
      currency: "AUD",
      ownerType: "TRANSPORT",
      ownerId: "transport-123",
      label: undefined,
      category: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedMinor).toBe(5000);
      expect(result.data.actualMinor).toBe(4850);
      expect(result.data.currency).toBe("AUD");
      expect(result.data.ownerType).toBe("TRANSPORT");
      expect(result.data.ownerId).toBe("transport-123");
    }
  });

  it("accepts a valid ACCOMMODATION cost without actualMinor", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 20000,
      currency: "USD",
      ownerType: "ACCOMMODATION",
      ownerId: "acc-456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actualMinor).toBeUndefined();
    }
  });

  it("accepts a valid ITEM cost", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1500,
      currency: "EUR",
      ownerType: "ITEM",
      ownerId: "item-789",
    });
    expect(result.success).toBe(true);
  });
});

describe("costSchema — valid OTHER cost", () => {
  it("accepts a valid OTHER cost with label and no ownerId", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 7500,
      currency: "GBP",
      ownerType: "OTHER",
      label: "Travel insurance",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ownerType).toBe("OTHER");
      expect(result.data.label).toBe("Travel insurance");
      expect(result.data.ownerId).toBeUndefined();
    }
  });

  it("accepts OTHER cost with optional category", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 3000,
      currency: "JPY",
      ownerType: "OTHER",
      label: "Visa fees",
      category: "admin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("admin");
    }
  });

  it("accepts OTHER cost with ownerId present (it's ignored but not rejected)", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "OTHER",
      label: "Misc",
      ownerId: "some-id",
    });
    // ownerId is allowed by schema even for OTHER — it's just not semantically used
    expect(result.success).toBe(true);
  });
});

describe("costSchema — paidAt handling", () => {
  it("accepts an ISO datetime paidAt and coerces to Date", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "TRANSPORT",
      ownerId: "t-1",
      paidAt: "2026-07-15T10:30:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paidAt).toBeInstanceOf(Date);
    }
  });

  it("accepts a YYYY-MM-DD paidAt and coerces to Date", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "TRANSPORT",
      ownerId: "t-1",
      paidAt: "2026-07-15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paidAt).toBeInstanceOf(Date);
    }
  });

  it("accepts absent paidAt", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 500,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paidAt).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Rejection cases
// ---------------------------------------------------------------------------

describe("costSchema — rejection cases", () => {
  it("rejects entity cost missing ownerId", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "TRANSPORT",
      // no ownerId
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.ownerId).toBeDefined();
    }
  });

  it("rejects ACCOMMODATION cost missing ownerId", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 5000,
      currency: "USD",
      ownerType: "ACCOMMODATION",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.ownerId).toBeDefined();
    }
  });

  it("rejects OTHER cost missing label", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "OTHER",
      // no label
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.label).toBeDefined();
    }
  });

  it("rejects negative estimatedMinor", () => {
    const result = costSchema.safeParse({
      estimatedMinor: -100,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.estimatedMinor).toBeDefined();
    }
  });

  it("rejects negative actualMinor", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      actualMinor: -50,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.actualMinor).toBeDefined();
    }
  });

  it("accepts zero estimatedMinor (free item)", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 0,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(true);
  });

  it("actualMinor is optional — omitting it is valid", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actualMinor).toBeUndefined();
    }
  });

  it("rejects unknown currency code", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "XYZ",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.currency).toBeDefined();
    }
  });

  it("rejects invalid ownerType", () => {
    const result = costSchema.safeParse({
      estimatedMinor: 1000,
      currency: "AUD",
      ownerType: "INVALID",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
  });
});
