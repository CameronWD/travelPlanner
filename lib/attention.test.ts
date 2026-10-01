import { describe, it, expect, vi } from "vitest";
import { requestAttention, subscribeAttention } from "./attention";

describe("attention (spec 2026-10-01 §G)", () => {
  it("delivers the target to every subscriber, and stops after unsubscribe", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAttention(a);
    subscribeAttention(b);
    requestAttention("feedback");
    expect(a).toHaveBeenCalledWith("feedback");
    expect(b).toHaveBeenCalledWith("feedback");
    offA();
    requestAttention("feedback");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("is fire-and-forget: a request with no subscriber does nothing", () => {
    expect(() => requestAttention("feedback")).not.toThrow();
  });
});
