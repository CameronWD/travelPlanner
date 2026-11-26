import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./item-form-dialog", () => ({
  ItemFormDialog: ({ open, defaultUnscheduled }: { open: boolean; defaultUnscheduled?: boolean }) =>
    open ? <div role="dialog" aria-label="Idea form" data-unscheduled={String(defaultUnscheduled)} /> : null,
}));
vi.mock("./add-from-globe-dialog", () => ({
  AddFromGlobeDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Add from Globe" /> : null,
}));
vi.mock("./ai-activity-suggestions", () => ({
  AiActivitySuggestions: ({ stopId, stopName }: { stopId: string; stopName: string }) => (
    <div data-testid="suggestions" data-stop={stopId}>{stopName}</div>
  ),
}));

import { WishlistAddMenu } from "./wishlist-add-menu";

const baseProps = {
  tripId: "t1",
  stops: [
    { id: "s1", name: "Paris" },
    { id: "s2", name: "Lyon" },
  ],
  tripStartDate: "2026-07-01",
  homeCurrency: "USD",
  hasGlobe: true,
  globeMarkers: [],
  addedMarkerIds: [],
  aiConfigured: true,
};

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add an idea" }));
}

describe("WishlistAddMenu", () => {
  it('the trigger is one button named "Add an idea"', async () => {
    const user = userEvent.setup();
    render(<WishlistAddMenu {...baseProps} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await openMenu(user);
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Type it in", "From your Globe", "Suggest some for a Stop"]);
  });

  it("no Globe entry without a Globe", async () => {
    const user = userEvent.setup();
    render(<WishlistAddMenu {...baseProps} hasGlobe={false} />);
    await openMenu(user);
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Type it in", "Suggest some for a Stop"]);
  });

  it("no suggestions entry without AI or without a Stop", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WishlistAddMenu {...baseProps} aiConfigured={false} />);
    await openMenu(user);
    expect((await screen.findAllByRole("menuitem")).map((i) => i.textContent)).toEqual(["Type it in", "From your Globe"]);
    unmount();
    render(<WishlistAddMenu {...baseProps} stops={[]} />);
    await openMenu(user);
    expect((await screen.findAllByRole("menuitem")).map((i) => i.textContent)).toEqual(["Type it in", "From your Globe"]);
  });

  it("Type it in opens the idea form", async () => {
    const user = userEvent.setup();
    render(<WishlistAddMenu {...baseProps} />);
    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Type it in" }));
    expect(screen.getByRole("dialog", { name: "Idea form" })).toHaveAttribute("data-unscheduled", "true");
  });

  it("From your Globe opens the Globe picker", async () => {
    const user = userEvent.setup();
    render(<WishlistAddMenu {...baseProps} />);
    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "From your Globe" }));
    expect(screen.getByRole("dialog", { name: "Add from Globe" })).toBeInTheDocument();
  });

  it("Suggest some for a Stop asks which Stop, then shows that Stop's suggestions", async () => {
    const user = userEvent.setup();
    render(<WishlistAddMenu {...baseProps} />);
    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Suggest some for a Stop" }));
    expect(await screen.findByRole("dialog", { name: "Suggestions for a Stop" })).toBeInTheDocument();
    expect(screen.queryByTestId("suggestions")).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Paris", "Lyon"]);
    await user.click(screen.getByRole("option", { name: "Lyon" }));
    expect(screen.getByTestId("suggestions")).toHaveAttribute("data-stop", "s2");
  });
});
