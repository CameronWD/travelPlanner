import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkSources } from "@/test/helpers/walk-sources";

/**
 * Card 2.H: an undoable write goes through `useUndoableAction`, which owns
 * apply, persist, revert, the Undo and their toasts. `toastWithUndo` is its
 * primitive; nothing else should reach for it.
 */
describe("toastWithUndo has one caller (card 2.H)", () => {
  it("toastWithUndo is only called by useUndoableAction", () => {
    const users = ["components", "app"]
      .flatMap((d) => walkSources(d, { skipTests: true }))
      .filter((f) => /\btoastWithUndo\b/.test(readFileSync(f, "utf8")));
    expect(users.sort()).toEqual(["components/ui/undo-toast.tsx", "components/ui/use-undoable-action.ts"]);
  });
});
