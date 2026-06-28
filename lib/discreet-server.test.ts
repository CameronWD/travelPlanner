import { vi, describe, it, expect, beforeEach } from "vitest";
import { getDiscreetState } from "@/lib/discreet-server";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

describe("getDiscreetState", () => {
  beforeEach(() => cookieStore.get.mockReset());
  it("off by default", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getDiscreetState()).toEqual({ discreet: false, label: "Workspace" });
  });
  it("on with resolved custom label", async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === "teepee-discreet" ? { value: "1" } : { value: "Q3 Tracker" });
    expect(await getDiscreetState()).toEqual({ discreet: true, label: "Q3 Tracker" });
  });
});
