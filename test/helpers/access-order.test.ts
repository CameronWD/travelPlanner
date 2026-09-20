import { describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "./access-order";

describe("expectAccessCheckedBeforeWrite", () => {
  it("passes when access ran first", () => {
    const access = vi.fn();
    const write = vi.fn();
    access();
    write();
    expect(() => expectAccessCheckedBeforeWrite(access, write)).not.toThrow();
  });

  it("FAILS when the write ran first — the whole point", () => {
    const access = vi.fn();
    const write = vi.fn();
    write();
    access();
    expect(() => expectAccessCheckedBeforeWrite(access, write)).toThrow(/before/i);
  });

  it("fails when access was never called at all", () => {
    const access = vi.fn();
    const write = vi.fn();
    write();
    expect(() => expectAccessCheckedBeforeWrite(access, write)).toThrow(/never/i);
  });
});
