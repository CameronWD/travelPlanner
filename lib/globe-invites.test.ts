import { describe, expect, it, vi } from "vitest";

// Mock side-effectful dependencies so the pure-core tests can run without a DB.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/globe", () => ({ getUserGlobe: vi.fn() }));

import { decideGlobeMembership } from "./globe-invites";

const inv = (id: string, email: string) => ({ id, globeId: `globe-${id}`, email });

describe("decideGlobeMembership", () => {
  it("returns null when the user already has a globe (defer merge)", () => {
    expect(decideGlobeMembership([inv("1", "a@x.com")], true, "a@x.com")).toBeNull();
  });

  it("returns the matching invite when the user has no globe", () => {
    const chosen = decideGlobeMembership([inv("1", "a@x.com")], false, "a@x.com");
    expect(chosen?.id).toBe("1");
  });

  it("matches email case-insensitively", () => {
    const chosen = decideGlobeMembership([inv("1", "A@X.com")], false, "a@x.com");
    expect(chosen?.id).toBe("1");
  });

  it("ignores invites addressed to a different email", () => {
    expect(decideGlobeMembership([inv("1", "b@x.com")], false, "a@x.com")).toBeNull();
  });

  it("picks the first matching invite when several exist", () => {
    const chosen = decideGlobeMembership(
      [inv("1", "a@x.com"), inv("2", "a@x.com")],
      false,
      "a@x.com",
    );
    expect(chosen?.id).toBe("1");
  });
});
