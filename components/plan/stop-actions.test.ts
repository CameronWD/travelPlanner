import { describe, it, expect, vi } from "vitest";
import { buildStopActions, type StopActionFlags, type StopActionHandlers } from "./stop-actions";

const handlers = (): StopActionHandlers => ({
  onEdit: vi.fn(), onAdjustDates: vi.fn(), onTogglePin: vi.fn(), onMakeRough: vi.fn(),
  onMoveUp: vi.fn(), onMoveDown: vi.fn(), onGiveDates: vi.fn(), onStartChapter: vi.fn(),
  onAssignChapter: vi.fn(), onAddReminder: vi.fn(), onNotes: vi.fn(), onFiles: vi.fn(), onDelete: vi.fn(),
  onMakeSurprise: vi.fn(), onRevealSurprise: vi.fn(),
});
const DATED = { name: "Rome", arriveDate: "2026-12-15", departDate: "2026-12-22", pinned: false };
const ROUGH = { name: "Munich", arriveDate: null, departDate: null, pinned: false };
const FLAGS: StopActionFlags = {
  isFirst: false, isLast: false, isPending: false, isOwner: true,
  chaptersEnabled: true, canRemind: true, notesCount: 2, filesCount: 1,
  surprise: null, currentUserId: "cam", loneOnDatedTrip: false,
};
const keys = (g: ReturnType<typeof buildStopActions>) => g.map((grp) => grp.map((i) => i.key));

describe("buildStopActions (PLAN.md §7.6)", () => {
  it("a dated stop: dates group, then chapter/reminder/notes/files, then delete", () => {
    const g = buildStopActions(DATED, FLAGS, handlers());
    expect(keys(g)).toEqual([
      ["edit", "adjust-dates", "pin", "surprise", "make-rough"],
      ["start-chapter", "add-reminder", "notes", "files"],
      ["delete"],
    ]);
    expect(g[0][0].label).toBe("Edit name & place");
    expect(g[0][1]).toMatchObject({ label: "Adjust dates", hint: "moves later stops" });
    expect(g[0][2]).toMatchObject({ label: "Pin dates", hint: "stops the shuffle" });
    expect(g[1][2].label).toBe("Notes (2)");
    expect(g[1][3].label).toBe("Files (1)");
    expect(g[2][0]).toMatchObject({ label: "Delete Rome", destructive: true, hint: "owner only" });
  });

  it("a lone Stop on a dated Trip has no Make rough (ADR 0073)", () => {
    const g = buildStopActions(DATED, { ...FLAGS, loneOnDatedTrip: true }, handlers());
    expect(g.flat().map((a) => a.key)).not.toContain("make-rough");
  });

  it("a dated Stop with neighbours keeps Make rough", () => {
    const g = buildStopActions(DATED, { ...FLAGS, loneOnDatedTrip: false }, handlers());
    expect(g.flat().map((a) => a.key)).toContain("make-rough");
  });

  it("a pinned stop offers Unpin dates", () => {
    expect(buildStopActions({ ...DATED, pinned: true }, FLAGS, handlers())[0][2].label).toBe("Unpin dates");
  });

  it("a rough stop: move up/down and Give it dates; Assign to chapter; no pin", () => {
    expect(keys(buildStopActions(ROUGH, FLAGS, handlers()))).toEqual([
      ["edit", "up", "down", "give-dates", "surprise"],
      ["start-chapter", "assign-chapter", "add-reminder", "notes", "files"],
      ["delete"],
    ]);
  });

  it("first and last disable their move", () => {
    const g = buildStopActions(ROUGH, { ...FLAGS, isFirst: true, isLast: true }, handlers());
    expect(g[0].find((i) => i.key === "up")?.disabled).toBe(true);
    expect(g[0].find((i) => i.key === "down")?.disabled).toBe(true);
  });

  it("drops what the viewer can't do: non-owner, fork, chapters off, no counts", () => {
    const g = buildStopActions(
      DATED,
      { ...FLAGS, isOwner: false, canRemind: false, chaptersEnabled: false, notesCount: null, filesCount: null },
      handlers(),
    );
    expect(keys(g)).toEqual([["edit", "adjust-dates", "pin", "surprise", "make-rough"]]);
  });

  it("zero counts read plain Notes / Files", () => {
    const g = buildStopActions(DATED, { ...FLAGS, notesCount: 0, filesCount: 0 }, handlers());
    expect(g[1].map((i) => i.label)).toEqual(["Start a chapter here", "Add a reminder", "Notes", "Files"]);
  });

  it("pending disables every mutating item but not Notes / Files", () => {
    const g = buildStopActions(DATED, { ...FLAGS, isPending: true }, handlers());
    for (const item of g.flat()) {
      expect(item.disabled ?? false).toBe(!["notes", "files"].includes(item.key));
    }
  });

  it("each item calls its own handler", () => {
    const h = handlers();
    const g = buildStopActions(ROUGH, FLAGS, h);
    g.flat().forEach((i) => i.onSelect());
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect(h.onGiveDates).toHaveBeenCalledTimes(1);
    expect(h.onAssignChapter).toHaveBeenCalledTimes(1);
    expect(h.onDelete).toHaveBeenCalledTimes(1);
    expect(h.onAdjustDates).not.toHaveBeenCalled();
  });

  describe("Surprise (CONTEXT.md)", () => {
    const view = (over = {}) => ({
      plannerId: "cam", plannerName: "Cam", forIds: ["sam"], forNames: ["Sam"], youAreSurprised: false, ...over,
    });

    it("no Surprise: Make it a surprise, after the pin entry", () => {
      const h = handlers();
      const item = buildStopActions(DATED, FLAGS, h)[0].find((i) => i.key === "surprise")!;
      expect(item).toMatchObject({ label: "Make it a surprise", hint: "hide what's inside from someone" });
      item.onSelect();
      expect(h.onMakeSurprise).toHaveBeenCalledTimes(1);
    });

    it("the planner sees Reveal the surprise, not Make it a surprise", () => {
      const h = handlers();
      const g = buildStopActions(DATED, { ...FLAGS, surprise: view() }, h);
      expect(keys(g)[0]).toEqual(["edit", "adjust-dates", "pin", "reveal", "make-rough"]);
      const item = g[0].find((i) => i.key === "reveal")!;
      expect(item).toMatchObject({ label: "Reveal the surprise", hint: "everyone sees inside" });
      item.onSelect();
      expect(h.onRevealSurprise).toHaveBeenCalledTimes(1);
    });

    it("a helper who is in on it (not the planner) gets neither entry, even as owner", () => {
      const g = buildStopActions(DATED, { ...FLAGS, surprise: view({ plannerId: "alex" }) }, handlers());
      expect(keys(g)[0]).toEqual(["edit", "adjust-dates", "pin", "make-rough"]);
    });

    it("the surprised get no menu at all", () => {
      expect(buildStopActions(DATED, { ...FLAGS, surprise: view({ youAreSurprised: true }) }, handlers())).toEqual([]);
    });
  });
});
