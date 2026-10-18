import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reviewPermissionOf } from "@/lib/review-permission-reads";

// Real Postgres (npm run test:integration): the Reviews tab reads the
// viewer's own permission to decide whether to offer a Review (R12).
const LIMITED = "it-rpo-limited";
const DEFAULT = "it-rpo-default";

describe.skipIf(process.env.INTEGRATION !== "1")("reviewPermissionOf (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [LIMITED, DEFAULT] } } });
    await db.user.create({ data: { id: LIMITED, email: "rpo-limited@example.test", name: "Rpo Limited", reviewPermission: "LIMITED" } });
    await db.user.create({ data: { id: DEFAULT, email: "rpo-default@example.test", name: "Rpo Default" } });
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [LIMITED, DEFAULT] } } });
  });

  it("reads the stored permission", async () => {
    expect(await reviewPermissionOf(LIMITED)).toBe("LIMITED");
  });
  it("a new account is Off (the column default)", async () => {
    expect(await reviewPermissionOf(DEFAULT)).toBe("OFF");
  });
  it("an unknown account is Off", async () => {
    expect(await reviewPermissionOf("it-rpo-nobody")).toBe("OFF");
  });
});
