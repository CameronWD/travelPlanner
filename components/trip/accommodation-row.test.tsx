import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

import { AccommodationRow } from "./accommodation-row";

const accommodation = {
  id: "acc1",
  stopId: "s1",
  name: "Hotel du Louvre",
  address: "Place André Malraux",
  checkIn: "2026-12-05",
  checkOut: "2026-12-07",
  confirmation: "ABC123",
  notes: null,
  lat: null,
  lng: null,
};
const stop = { arriveDate: "2026-12-05", departDate: "2026-12-07" };

it("renders collapsed by default: name + date range, no address", () => {
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  const row = screen.getByRole("button", { name: /Hotel du Louvre/ });
  expect(row).toHaveAttribute("aria-expanded", "false");
  expect(row).toHaveTextContent("5–7 Dec 2026");
  expect(screen.queryByText("Place André Malraux")).not.toBeInTheDocument();
});

it("expands to the full AccommodationCard", async () => {
  const user = userEvent.setup();
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  await user.click(screen.getByRole("button", { name: /Hotel du Louvre/ }));
  expect(screen.getByText("Place André Malraux")).toBeInTheDocument();
});

it("keeps the same toggle button (and its focus) across expand/collapse instead of unmounting it", async () => {
  const user = userEvent.setup();
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  const toggle = screen.getByRole("button", { name: /Hotel du Louvre/ });
  toggle.focus();
  await user.click(toggle);
  const stillToggle = screen.getByRole("button", { name: /Hotel du Louvre/ });
  expect(stillToggle).toBe(toggle);
  expect(stillToggle).toHaveAttribute("aria-expanded", "true");
  expect(document.activeElement).toBe(toggle);

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(document.activeElement).toBe(toggle);
});

it("expands in place: the card sits inside the same wrapper as the toggle, with no second shadowed card", async () => {
  const user = userEvent.setup();
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  const toggle = screen.getByRole("button", { name: /Hotel du Louvre/ });
  await user.click(toggle);
  const wrapper = toggle.closest('[data-testid="accommodation-row"]');
  expect(wrapper).not.toBeNull();
  const card = screen.getByTestId("accommodation-card");
  expect(wrapper).toContainElement(card);
  expect(card.className).not.toMatch(/shadow-hard|shadow-soft/);
});

const cost = {
  id: "c1",
  costMinor: 30000,
  paidMinor: null,
  currency: "EUR",
  rateToHome: null,
  paidAt: null as Date | null,
  dueDate: null,
  settlement: "BEFORE",
  ownerType: "ACCOMMODATION",
  ownerId: "acc1",
  label: null,
  category: null,
};

it("shows the confirmation and 'paid ✓' on the collapsed row when a cost is paid", () => {
  render(
    <AccommodationRow
      accommodation={accommodation}
      stop={stop}
      costs={[{ ...cost, paidAt: new Date("2026-11-01") }]}
    />,
  );
  const row = screen.getByRole("button", { name: /Hotel du Louvre/ });
  expect(row).toHaveAttribute("aria-expanded", "false");
  expect(row).toHaveTextContent("ABC123");
  expect(screen.getByLabelText("Confirmation ABC123")).toBeInTheDocument();
  expect(row).toHaveTextContent("paid ✓");
});

it("shows 'unpaid' when costs exist but none is paid, and no badge without costs", () => {
  const { rerender } = render(
    <AccommodationRow accommodation={accommodation} stop={stop} costs={[cost]} />,
  );
  const row = screen.getByRole("button", { name: /Hotel du Louvre/ });
  expect(row).toHaveTextContent("unpaid");
  rerender(<AccommodationRow accommodation={accommodation} stop={stop} costs={[]} />);
  expect(row).not.toHaveTextContent(/paid/);
});

describe("phone layout (spec 2026-09-28 D7)", () => {
  it("the name truncates at every width (never breaks inside a word), on a first line with the chevron", () => {
    render(<AccommodationRow accommodation={accommodation} stop={stop} />);
    const name = screen.getByText("Hotel du Louvre");
    expect(name.className).toContain("truncate");
    expect(name.className).not.toContain("break-words");
    const firstLine = name.parentElement as HTMLElement;
    expect(firstLine).toHaveAttribute("data-slot", "accommodation-row-line-1");
    expect(firstLine.querySelector("svg.lucide-chevron-down")).not.toBeNull();
  });

  it("dates and the paid badge sit on a second line below sm; the confirmation number is hidden there and only shown from sm up", () => {
    render(<AccommodationRow accommodation={accommodation} stop={stop} costs={[{ ...cost, paidAt: new Date("2026-11-01") }]} />);
    const secondLine = document.querySelector('[data-slot="accommodation-row-line-2"]') as HTMLElement;
    expect(secondLine).toHaveTextContent("5–7 Dec 2026");
    expect(secondLine).toHaveTextContent("paid ✓");
    const confirmation = screen.getByLabelText("Confirmation ABC123");
    expect(confirmation.className.split(/\s+/)).toContain("hidden");
    expect(confirmation.className.split(/\s+/)).toContain("sm:inline-flex");
  });

  it("second line holds the dates even with nothing else (no confirmation, no costs, no warning)", () => {
    render(<AccommodationRow accommodation={{ ...accommodation, confirmation: null }} stop={stop} />);
    const secondLine = document.querySelector('[data-slot="accommodation-row-line-2"]') as HTMLElement;
    expect(secondLine).toHaveTextContent("5–7 Dec 2026");
    expect(screen.queryByLabelText(/Confirmation/)).toBeNull();
  });
});
