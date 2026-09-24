import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import GlobalError from "@/app/global-error";

describe("global-error", () => {
  it("renders a retry that calls reset", () => {
    const reset = vi.fn();
    render(<GlobalError error={Object.assign(new Error("x"), { digest: "d" })} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("has no raw hex and no emoji (colours come from its own CSS variables)", () => {
    const src = readFileSync("app/global-error.tsx", "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
