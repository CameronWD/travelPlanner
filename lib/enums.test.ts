import { describe, expect, it } from "vitest";
import {
  CHECKLIST_KINDS,
  COST_OWNER_TYPES,
  MEMBER_ROLES,
  TARGET_TYPES,
  TRANSPORT_MODES,
  VOTE_LEVELS,
  checklistKindSchema,
  costOwnerTypeSchema,
  memberRoleSchema,
  targetTypeSchema,
  transportModeSchema,
  voteLevelSchema,
} from "@/lib/enums";

describe("enums", () => {
  it("defines the transport modes", () => {
    expect(TRANSPORT_MODES).toEqual([
      "FLIGHT",
      "TRAIN",
      "BUS",
      "CAR",
      "FERRY",
      "OTHER",
    ]);
  });

  it("defines the cost owner types", () => {
    expect(COST_OWNER_TYPES).toEqual([
      "TRANSPORT",
      "ACCOMMODATION",
      "ITEM",
      "OTHER",
    ]);
  });

  it("defines the vote levels", () => {
    expect(VOTE_LEVELS).toEqual(["MUST", "KEEN", "MEH"]);
  });

  it("defines the checklist kinds", () => {
    expect(CHECKLIST_KINDS).toEqual(["PRETRIP", "PACKING"]);
  });

  it("defines the member roles", () => {
    expect(MEMBER_ROLES).toEqual(["owner", "member"]);
  });

  it("defines the note/attachment target types", () => {
    expect(TARGET_TYPES).toEqual([
      "TRIP",
      "STOP",
      "ITEM",
      "TRANSPORT",
      "ACCOMMODATION",
    ]);
  });

  it("validates and rejects via the Zod schemas", () => {
    expect(transportModeSchema.parse("TRAIN")).toBe("TRAIN");
    expect(transportModeSchema.safeParse("TELEPORT").success).toBe(false);

    expect(costOwnerTypeSchema.parse("ITEM")).toBe("ITEM");
    expect(costOwnerTypeSchema.safeParse("PERSON").success).toBe(false);

    expect(voteLevelSchema.parse("MUST")).toBe("MUST");
    expect(voteLevelSchema.safeParse("NOPE").success).toBe(false);

    expect(checklistKindSchema.parse("PACKING")).toBe("PACKING");
    expect(checklistKindSchema.safeParse("OTHER").success).toBe(false);

    expect(memberRoleSchema.parse("owner")).toBe("owner");
    expect(memberRoleSchema.safeParse("admin").success).toBe(false);

    expect(targetTypeSchema.parse("STOP")).toBe("STOP");
    expect(targetTypeSchema.safeParse("COST").success).toBe(false);
  });
});
