import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ActionResult } from "@/lib/action-result";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/ui/undo-toast", () => ({ toastWithUndo: vi.fn(() => "t1") }));

import { toast } from "@/components/ui/use-toast";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { SOMETHING_WENT_WRONG } from "@/components/ui/action-failure";
import { useUndoableAction, UNDO_FAILED, type UndoableSpec } from "./use-undoable-action";

const toastMock = vi.mocked(toast);
const undoToastMock = vi.mocked(toastWithUndo);

type Intent = { id: string };
type Res = { itemId: string };

function spec(overrides: Partial<UndoableSpec<Intent, Res>> = {}): UndoableSpec<Intent, Res> {
  return {
    apply: vi.fn(),
    persist: vi.fn(async (): Promise<ActionResult<Res>> => ({ success: true, itemId: "i1" })),
    revert: vi.fn(),
    done: () => ({ title: "Moved" }),
    ...overrides,
  };
}

/** Runs the Undo the success toast offered. */
function clickUndo() {
  const onUndo = undoToastMock.mock.calls.at(-1)![0].onUndo;
  onUndo();
}

describe("useUndoableAction", () => {
  beforeEach(() => {
    toastMock.mockClear();
    undoToastMock.mockClear();
  });

  it("applies, persists and shows a plain toast when there is no undo", async () => {
    const s = spec();
    const { result } = renderHook(() => useUndoableAction(s));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run({ id: "a" });
    });
    expect(ok).toBe(true);
    expect(s.apply).toHaveBeenCalledWith({ id: "a" });
    expect(s.persist).toHaveBeenCalledWith({ id: "a" });
    expect(s.revert).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({ title: "Moved" });
    expect(undoToastMock).not.toHaveBeenCalled();
  });

  it("shows no toast when done returns null or is absent", async () => {
    const s = spec({ done: () => null });
    const { result } = renderHook(() => useUndoableAction(s));
    await act(async () => {
      await result.current.run({ id: "a" });
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("reverts and toasts the server's message on success:false", async () => {
    const s = spec({
      persist: vi.fn(async (): Promise<ActionResult<Res>> => ({ success: false, errors: { _: ["Nope"] } })),
    });
    const { result } = renderHook(() => useUndoableAction(s));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run({ id: "a" });
    });
    expect(ok).toBe(false);
    expect(s.revert).toHaveBeenCalledWith({ id: "a" });
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Nope" });
  });

  it("uses the spec's failure copy when a refusal carries no message", async () => {
    const s = spec({
      failure: "Couldn't move that.",
      persist: vi.fn(async (): Promise<ActionResult<Res>> => ({ success: false, errors: {} })),
    });
    const { result } = renderHook(() => useUndoableAction(s));
    await act(async () => {
      await result.current.run({ id: "a" });
    });
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't move that." });
  });

  it("reverts and toasts SOMETHING_WENT_WRONG when persist rejects", async () => {
    const s = spec({ persist: vi.fn(async () => Promise.reject(new Error("network"))) });
    const { result } = renderHook(() => useUndoableAction(s));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run({ id: "a" });
    });
    expect(ok).toBe(false);
    expect(s.revert).toHaveBeenCalledWith({ id: "a" });
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: SOMETHING_WENT_WRONG });
  });

  it("offers Undo via toastWithUndo; clicking it applies the undo locally, then calls the server", async () => {
    const order: string[] = [];
    const s = spec({
      undo: vi.fn(async () => {
        order.push("undo");
        return { success: true as const };
      }),
      applyUndo: vi.fn(() => order.push("applyUndo")),
      revertUndo: vi.fn(),
      done: () => ({ title: "Moved", description: "to Day 2" }),
    });
    const { result } = renderHook(() => useUndoableAction(s));
    await act(async () => {
      await result.current.run({ id: "a" });
    });
    expect(toastMock).not.toHaveBeenCalled();
    expect(undoToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Moved", description: "to Day 2", onUndo: expect.any(Function) }),
    );
    await act(async () => {
      clickUndo();
    });
    await waitFor(() => expect(s.undo).toHaveBeenCalled());
    expect(order).toEqual(["applyUndo", "undo"]);
    expect(s.applyUndo).toHaveBeenCalledWith({ id: "a" }, { success: true, itemId: "i1" });
    expect(s.undo).toHaveBeenCalledWith({ id: "a" }, { success: true, itemId: "i1" });
    expect(s.revertUndo).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  describe("a failed Undo", () => {
    const unhandled = vi.fn();
    beforeEach(() => {
      unhandled.mockClear();
      process.on("unhandledRejection", unhandled);
    });
    afterEach(() => {
      process.off("unhandledRejection", unhandled);
    });

    it("toasts UNDO_FAILED, calls revertUndo and never rejects unhandled when undo throws", async () => {
      const s = spec({
        undo: vi.fn(async () => Promise.reject(new Error("network"))),
        applyUndo: vi.fn(),
        revertUndo: vi.fn(),
      });
      const { result } = renderHook(() => useUndoableAction(s));
      await act(async () => {
        await result.current.run({ id: "a" });
      });
      await act(async () => {
        clickUndo();
      });
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: UNDO_FAILED }),
      );
      expect(s.revertUndo).toHaveBeenCalledWith({ id: "a" }, { success: true, itemId: "i1" });
      // Give any stray rejection a turn to surface.
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    });

    it("toasts the server's refusal (else UNDO_FAILED) and calls revertUndo on success:false", async () => {
      const s = spec({
        undo: vi.fn(async () => ({ success: false as const, errors: { _: ["Already gone"] } })),
        revertUndo: vi.fn(),
      });
      const { result } = renderHook(() => useUndoableAction(s));
      await act(async () => {
        await result.current.run({ id: "a" });
      });
      await act(async () => {
        clickUndo();
      });
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Already gone" }),
      );
      expect(s.revertUndo).toHaveBeenCalledTimes(1);
    });

    it("still toasts UNDO_FAILED when applyUndo itself throws", async () => {
      const s = spec({
        undo: vi.fn(async () => ({ success: true as const })),
        applyUndo: vi.fn(() => {
          throw new Error("boom");
        }),
      });
      const { result } = renderHook(() => useUndoableAction(s));
      await act(async () => {
        await result.current.run({ id: "a" });
      });
      await act(async () => {
        clickUndo();
      });
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: UNDO_FAILED }),
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  it("pending is true between run start and settle", async () => {
    let resolve!: (r: ActionResult<Res>) => void;
    const s = spec({ persist: () => new Promise((r) => (resolve = r)) });
    const { result } = renderHook(() => useUndoableAction(s));
    expect(result.current.pending).toBe(false);
    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run({ id: "a" });
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      resolve({ success: true, itemId: "i1" });
      await running;
    });
    expect(result.current.pending).toBe(false);
  });

  it("pending comes back down when persist throws", async () => {
    let reject!: (e: unknown) => void;
    const s = spec({ persist: () => new Promise((_, r) => (reject = r)) });
    const { result } = renderHook(() => useUndoableAction(s));
    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run({ id: "a" });
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      reject(new Error("network"));
      await running;
    });
    expect(result.current.pending).toBe(false);
  });

  it("an in-flight run keeps the spec it started with across a re-render", async () => {
    let resolve!: (r: ActionResult<Res>) => void;
    const first = spec({ persist: () => new Promise((r) => (resolve = r)), done: () => ({ title: "First" }) });
    const second = spec({ done: () => ({ title: "Second" }) });
    const { result, rerender } = renderHook(({ s }) => useUndoableAction(s), {
      initialProps: { s: first },
    });
    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run({ id: "a" });
    });
    rerender({ s: second });
    await act(async () => {
      resolve({ success: true, itemId: "i1" });
      await running;
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "First" });
  });

  it("run is stable across renders", () => {
    const { result, rerender } = renderHook(({ s }) => useUndoableAction(s), {
      initialProps: { s: spec() },
    });
    const run = result.current.run;
    rerender({ s: spec() });
    expect(result.current.run).toBe(run);
  });
});
