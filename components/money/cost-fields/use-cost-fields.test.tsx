import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCostFields } from "./use-cost-fields";
import { emptyCostFormState, toCostPayload, type CostFormState } from "@/lib/money/cost-form-state";

vi.mock("@/lib/dates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dates")>()),
  todayLocalISO: () => "2026-10-15",
}));

afterEach(() => vi.clearAllMocks());

const seeded: CostFormState = {
  costAmount: "120.00",
  currency: "EUR",
  paid: false,
  paidAmount: "",
  paidAt: "",
  settlement: "ON_TRIP",
};

describe("useCostFields", () => {
  it("starts from the seed, and hands it to the fields", () => {
    const { result } = renderHook(() => useCostFields(seeded));
    expect(result.current.state).toEqual(seeded);
    expect(result.current.fieldProps.costAmount).toBe("120.00");
    expect(result.current.fieldProps.currency).toBe("EUR");
    expect(result.current.fieldProps.settlement).toBe("ON_TRIP");
    expect(result.current.fieldProps.paid).toBe(false);
  });

  it("keeps the first seed even when a later render passes another", () => {
    const { result, rerender } = renderHook(({ seed }) => useCostFields(seed), { initialProps: { seed: seeded } });
    rerender({ seed: emptyCostFormState("AUD") });
    expect(result.current.state.costAmount).toBe("120.00");
  });

  it("ticking Paid pre-fills the paid amount with the cost and the date with today", () => {
    const { result } = renderHook(() => useCostFields(seeded));
    act(() => result.current.fieldProps.onPaidChange(true));
    expect(result.current.state).toMatchObject({ paid: true, paidAmount: "120.00", paidAt: "2026-10-15" });
  });

  it("blanking the cost clears the paid state", () => {
    const { result } = renderHook(() => useCostFields({ ...seeded, paid: true, paidAmount: "100", paidAt: "2026-10-01" }));
    act(() => result.current.fieldProps.onCostChange(""));
    expect(result.current.state).toMatchObject({ costAmount: "", paid: false, paidAmount: "", paidAt: "" });
  });

  it("each setter edits its own field", () => {
    const { result } = renderHook(() => useCostFields(seeded));
    act(() => result.current.fieldProps.onCurrencyChange("GBP"));
    act(() => result.current.fieldProps.onSettlementChange("BEFORE"));
    act(() => result.current.fieldProps.onPaidAmountChange("90"));
    act(() => result.current.fieldProps.onPaidAtChange("2026-09-01"));
    expect(result.current.state).toMatchObject({ currency: "GBP", settlement: "BEFORE", paidAmount: "90", paidAt: "2026-09-01" });
  });

  it("payload() mirrors toCostPayload(state)", () => {
    const { result } = renderHook(() => useCostFields(seeded));
    expect(result.current.payload()).toEqual(toCostPayload(result.current.state));
    act(() => result.current.fieldProps.onPaidChange(true));
    expect(result.current.payload()).toEqual(toCostPayload(result.current.state));
    act(() => result.current.fieldProps.onPaidAmountChange(""));
    expect(result.current.payload()).toEqual({ kind: "invalid", errors: { paidMinor: ["Enter what you paid"] } });
  });

  it("dirtyValues change when any field changes", () => {
    const { result } = renderHook(() => useCostFields(seeded));
    const before = JSON.stringify(result.current.dirtyValues);
    act(() => result.current.fieldProps.onSettlementChange("BEFORE"));
    expect(JSON.stringify(result.current.dirtyValues)).not.toBe(before);
  });
});
