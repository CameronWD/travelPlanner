import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddCard } from "./add-card";

describe("AddCard", () => {
  it("is a dashed, desktop-only button that calls onClick", async () => {
    const onClick = vi.fn();
    render(<AddCard label="Add to Fri 11" onClick={onClick} />);
    const card = screen.getByRole("button", { name: "Add to Fri 11" });
    expect(card.className).toContain("border-dashed");
    expect(card.className).toContain("hidden");
    expect(card.className).toContain("lg:flex");
    await userEvent.click(card);
    expect(onClick).toHaveBeenCalled();
  });
});
