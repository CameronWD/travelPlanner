import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "add=item" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/trips/t1/wishlist",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("./item-form-dialog", () => ({
  ItemFormDialog: ({ open, defaultUnscheduled }: { open: boolean; defaultUnscheduled?: boolean }) =>
    open ? <div role="dialog" aria-label="Add Item" data-unscheduled={String(defaultUnscheduled)} /> : null,
}));

import { AddItemFromUrl } from "./add-item-from-url";

describe("AddItemFromUrl (spec 2026-10-06 §F)", () => {
  it("opens the Item form as a Wishlist idea on ?add=item", () => {
    render(<AddItemFromUrl tripId="t1" stops={[]} homeCurrency="AUD" />);
    expect(screen.getByRole("dialog", { name: "Add Item" })).toHaveAttribute("data-unscheduled", "true");
  });
  it("stays closed without it", () => {
    nav.search = "";
    render(<AddItemFromUrl tripId="t1" stops={[]} homeCurrency="AUD" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
