import { afterEach, describe, expect, it, vi } from "vitest";

const { allowedEmailFindUniqueMock } = vi.hoisted(() => ({
  allowedEmailFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    allowedEmail: { findUnique: allowedEmailFindUniqueMock },
  },
}));

import { isAllowedEmail } from "./allowlist";

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_ALLOWED_EMAILS === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS;
});

describe("isAllowedEmail", () => {
  it("admits an address in ALLOWED_EMAILS, case- and space-insensitively", async () => {
    process.env.ALLOWED_EMAILS = " Cam@Example.com , other@example.com ";
    await expect(isAllowedEmail("cam@example.com")).resolves.toBe(true);
  });

  it("admits an address held in the AllowedEmail table", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "friend@example.com" });
    await expect(isAllowedEmail("Friend@example.com")).resolves.toBe(true);
    // The needle passed to Prisma must already be normalised — the table is
    // backfilled/written lowercase (see the rollout-gate migration).
    expect(allowedEmailFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "friend@example.com" },
    });
  });

  it("refuses an unknown address", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    await expect(isAllowedEmail("stranger@example.com")).resolves.toBe(false);
  });

  it("refuses null/undefined/empty", async () => {
    await expect(isAllowedEmail(null)).resolves.toBe(false);
    await expect(isAllowedEmail(undefined)).resolves.toBe(false);
    await expect(isAllowedEmail("   ")).resolves.toBe(false);
  });

  it("does not query the table when ALLOWED_EMAILS already admits the address", async () => {
    process.env.ALLOWED_EMAILS = "cam@example.com";
    await expect(isAllowedEmail("cam@example.com")).resolves.toBe(true);
    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
  });

  it("fails closed (propagates rather than swallows) when the table lookup throws", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockRejectedValue(new Error("db down"));
    await expect(isAllowedEmail("cam@example.com")).rejects.toThrow("db down");
  });
});
