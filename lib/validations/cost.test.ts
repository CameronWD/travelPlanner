import { describe, expect, it } from "vitest";
import { costSchema } from "./cost";

// ---------------------------------------------------------------------------
// Valid cases
// ---------------------------------------------------------------------------

describe("costSchema — valid entity cost (TRANSPORT)", () => {
  it("accepts a valid TRANSPORT cost with all fields", () => {
    const result = costSchema.safeParse({
      costMinor: 5000,
      paidMinor: 4850,
      currency: "AUD",
      ownerType: "TRANSPORT",
      ownerId: "transport-123",
      label: undefined,
      category: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.costMinor).toBe(5000);
      expect(result.data.paidMinor).toBe(4850);
      expect(result.data.currency).toBe("AUD");
      expect(result.data.ownerType).toBe("TRANSPORT");
      expect(result.data.ownerId).toBe("transport-123");
    }
  });

  it("accepts a valid ACCOMMODATION cost without paidMinor", () => {
    const result = costSchema.safeParse({
      costMinor: 20000,
      currency: "USD",
      ownerType: "ACCOMMODATION",
      ownerId: "acc-456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paidMinor).toBeUndefined();
    }
  });

  it("accepts a valid ITEM cost", () => {
    const result = costSchema.safeParse({
      costMinor: 1500,
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
      costMinor: 7500,
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
      costMinor: 3000,
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
      costMinor: 1000,
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
      costMinor: 1000,
      paidMinor: 1000,
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
      costMinor: 1000,
      paidMinor: 1000,
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
      costMinor: 500,
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
      costMinor: 1000,
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
      costMinor: 5000,
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
      costMinor: 1000,
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

  it("rejects negative costMinor", () => {
    const result = costSchema.safeParse({
      costMinor: -100,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.costMinor).toBeDefined();
    }
  });

  it("rejects an costMinor above the 32-bit signed max (Postgres INTEGER)", () => {
    const result = costSchema.safeParse({
      costMinor: 2_147_483_648,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.costMinor).toBeDefined();
    }
  });

  it("rejects negative paidMinor", () => {
    const result = costSchema.safeParse({
      costMinor: 1000,
      paidMinor: -50,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.paidMinor).toBeDefined();
    }
  });

  it("accepts zero costMinor (free item)", () => {
    const result = costSchema.safeParse({
      costMinor: 0,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(true);
  });

  it("paidMinor is optional — omitting it is valid", () => {
    const result = costSchema.safeParse({
      costMinor: 1000,
      currency: "AUD",
      ownerType: "ITEM",
      ownerId: "item-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paidMinor).toBeUndefined();
    }
  });

  it("rejects unknown currency code", () => {
    const result = costSchema.safeParse({
      costMinor: 1000,
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
      costMinor: 1000,
      currency: "AUD",
      ownerType: "INVALID",
      ownerId: "item-1",
    });
    expect(result.success).toBe(false);
  });
});

const base = {
  costMinor: 34000,
  currency: "GBP",
  ownerType: "ACCOMMODATION" as const,
  ownerId: "a1",
};

describe("costSchema paid invariant", () => {
  it("rejects a paid date with no paid amount", () => {
    const result = costSchema.safeParse({ ...base, paidAt: "2026-06-04" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("paidMinor"));
      expect(issue?.message).toBe("Enter what you paid");
    }
  });

  it("accepts a paid date with a paid amount", () => {
    const result = costSchema.safeParse({
      ...base,
      paidAt: "2026-06-04",
      paidMinor: 34000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a paid amount with no paid date", () => {
    // Recording what something came to without confirming the payment date
    // stays legal — only the reverse is nonsense.
    const result = costSchema.safeParse({ ...base, paidMinor: 34000 });
    expect(result.success).toBe(true);
  });
});
