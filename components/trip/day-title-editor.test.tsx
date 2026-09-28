import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { setDayTitle } from "@/server/actions/day-titles";
import { toast } from "@/components/ui/use-toast";
import { useDayTitleEditor } from "./day-title-editor";

const args = { stopId: "s1", date: "2026-12-05", title: null as string | null };

describe("useDayTitleEditor (shared by the plan editor row and the Day view line)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts idle, seeds the value from the title when editing starts", () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    expect(result.current.editing).toBe(false);
    act(() => result.current.startEditing());
    expect(result.current.editing).toBe(true);
    expect(result.current.value).toBe("Rest day");
  });

  it("save trims, calls setDayTitle once and refreshes; a trailing blur is a no-op", async () => {
    const { result } = renderHook(() => useDayTitleEditor(args));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("  Sintra day trip "));
    await act(async () => { await result.current.save(); });
    await act(async () => { await result.current.save(); }); // the blur that follows Enter
    expect(setDayTitle).toHaveBeenCalledTimes(1);
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "s1", date: "2026-12-05", title: "Sintra day trip" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.editing).toBe(false);
  });

  it("an unchanged value saves nothing", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    act(() => result.current.startEditing());
    await act(async () => { await result.current.save(); });
    expect(setDayTitle).not.toHaveBeenCalled();
  });

  it("a failed save toasts and reopens with the typed text", async () => {
    vi.mocked(setDayTitle).mockResolvedValueOnce({ success: false, errors: { title: ["Keep it under 80 characters."] } });
    const { result } = renderHook(() => useDayTitleEditor(args));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Too long"));
    await act(async () => { await result.current.save(); });
    expect(toast).toHaveBeenCalled();
    expect(result.current.editing).toBe(true);
    expect(result.current.value).toBe("Too long");
  });

  it("a thrown save toasts and reopens with the typed text, same as a failed save (Minor #11)", async () => {
    vi.mocked(setDayTitle).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useDayTitleEditor(args));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Sintra day trip"));
    await act(async () => { await result.current.save(); });
    expect(toast).toHaveBeenCalled();
    expect(result.current.editing).toBe(true);
    expect(result.current.value).toBe("Sintra day trip");
  });

  it("an empty save clears the title (calls setDayTitle with an empty string)", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("   "));
    await act(async () => { await result.current.save(); });
    expect(setDayTitle).toHaveBeenCalledTimes(1);
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "s1", date: "2026-12-05", title: "" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancel restores the title and closes without saving", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Changed"));
    act(() => result.current.cancel());
    expect(result.current.editing).toBe(false);
    expect(setDayTitle).not.toHaveBeenCalled();
  });

  it("without a Stop it never saves", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, stopId: null }));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Orphan"));
    await act(async () => { await result.current.save(); });
    expect(setDayTitle).not.toHaveBeenCalled();
  });
});
