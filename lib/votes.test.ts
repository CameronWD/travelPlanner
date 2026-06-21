import { describe, expect, it } from "vitest";
import { combinedScore, sortItemsByVotes } from "./votes";
import type { VoteLike, SortableItem } from "./votes";

describe("combinedScore", () => {
  it("returns 0 for an empty votes array", () => {
    expect(combinedScore([])).toBe(0);
  });

  it("scores MUST as 2", () => {
    const votes: VoteLike[] = [{ level: "MUST" }];
    expect(combinedScore(votes)).toBe(2);
  });

  it("scores KEEN as 1", () => {
    const votes: VoteLike[] = [{ level: "KEEN" }];
    expect(combinedScore(votes)).toBe(1);
  });

  it("scores MEH as 0", () => {
    const votes: VoteLike[] = [{ level: "MEH" }];
    expect(combinedScore(votes)).toBe(0);
  });

  it("sums multiple votes correctly", () => {
    const votes: VoteLike[] = [
      { level: "MUST" },
      { level: "KEEN" },
    ];
    expect(combinedScore(votes)).toBe(3);
  });

  it("handles two MUST votes (max score = 4)", () => {
    const votes: VoteLike[] = [{ level: "MUST" }, { level: "MUST" }];
    expect(combinedScore(votes)).toBe(4);
  });

  it("handles two MEH votes (score = 0)", () => {
    const votes: VoteLike[] = [{ level: "MEH" }, { level: "MEH" }];
    expect(combinedScore(votes)).toBe(0);
  });
});

describe("sortItemsByVotes", () => {
  function makeItem(
    id: string,
    title: string,
    votes: Array<{ level: "MUST" | "KEEN" | "MEH" }>,
  ): SortableItem {
    return { id, title, votes };
  }

  it("returns a new array (does not mutate)", () => {
    const items = [makeItem("a", "Zoo", []), makeItem("b", "Art Museum", [])];
    const sorted = sortItemsByVotes(items);
    expect(sorted).not.toBe(items);
    expect(items[0].id).toBe("a"); // original unchanged
  });

  it("sorts items by descending combined score", () => {
    const items = [
      makeItem("c", "Coffee", [{ level: "MEH" }]),       // score 0
      makeItem("a", "Hiking", [{ level: "MUST" }, { level: "MUST" }]), // score 4
      makeItem("b", "Museum", [{ level: "MUST" }, { level: "KEEN" }]), // score 3
    ];
    const sorted = sortItemsByVotes(items);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties alphabetically (case-insensitive) by title", () => {
    const items = [
      makeItem("z", "zoo", [{ level: "KEEN" }]),
      makeItem("a", "Art gallery", [{ level: "KEEN" }]),
      makeItem("m", "Museum", [{ level: "KEEN" }]),
    ];
    const sorted = sortItemsByVotes(items);
    expect(sorted.map((i) => i.title)).toEqual(["Art gallery", "Museum", "zoo"]);
  });

  it("places items with no votes after items with votes", () => {
    const items = [
      makeItem("n", "No votes", []),
      makeItem("v", "Has vote", [{ level: "KEEN" }]),
    ];
    const sorted = sortItemsByVotes(items);
    expect(sorted[0].id).toBe("v");
    expect(sorted[1].id).toBe("n");
  });

  it("handles empty input", () => {
    expect(sortItemsByVotes([])).toEqual([]);
  });

  it("handles a single item", () => {
    const items = [makeItem("x", "Single", [{ level: "MUST" }])];
    expect(sortItemsByVotes(items)).toHaveLength(1);
  });
});
