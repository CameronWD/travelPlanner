import { describe, expect, it } from "vitest";
import { currentActivitySource, getActingTraveller, runAsTraveller } from "./acting-traveller";

const cam = { id: "u1", name: "Cam", email: "c@x.test", image: null };
const sam = { id: "u2", name: "Sam", email: "s@x.test", image: null };

describe("acting traveller", () => {
  it("is null outside a scope", () => {
    expect(getActingTraveller()).toBeNull();
    expect(currentActivitySource()).toBeNull();
  });
  it("is visible across awaits inside the scope", async () => {
    await runAsTraveller(cam, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(getActingTraveller()).toEqual(cam);
      expect(currentActivitySource()).toBe("CLAUDE");
    });
    expect(getActingTraveller()).toBeNull();
  });
  it("keeps concurrent scopes apart", async () => {
    const seen: string[] = [];
    await Promise.all([
      runAsTraveller(cam, async () => { await new Promise((r) => setTimeout(r, 5)); seen.push(getActingTraveller()!.id); }),
      runAsTraveller(sam, async () => { await new Promise((r) => setTimeout(r, 1)); seen.push(getActingTraveller()!.id); }),
    ]);
    expect(seen.sort()).toEqual(["u1", "u2"]);
  });
});
