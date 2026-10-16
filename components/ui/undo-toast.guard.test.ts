import { describe, it } from "vitest";

/**
 * Card 2.H: an undoable write goes through `useUndoableAction`, which owns
 * apply, persist, revert, the Undo and their toasts. `toastWithUndo` is its
 * primitive; nothing else should reach for it.
 *
 * Todo until Task 17 moves `applyReorderResult` (itinerary-manager.tsx) onto
 * the hook — it is the last direct caller. Task 17 Step 6 replaces the
 * `it.todo` with this body:
 *
 *   import { expect } from "vitest";
 *   import { readFileSync } from "node:fs";
 *   import { walkSources } from "@/test/helpers/walk-sources";
 *
 *   it("toastWithUndo is only called by useUndoableAction", () => {
 *     const users = ["components", "app"]
 *       .flatMap((d) => walkSources(d, { skipTests: true }))
 *       .filter((f) => /\btoastWithUndo\b/.test(readFileSync(f, "utf8")));
 *     expect(users.sort()).toEqual(["components/ui/undo-toast.tsx", "components/ui/use-undoable-action.ts"]);
 *   });
 */
describe("toastWithUndo has one caller (card 2.H)", () => {
  it.todo("toastWithUndo is only called by useUndoableAction");
});
