import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TonightCard } from "@/components/trip/day/tonight-card";
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...r}>{children}</a> }));

const tonight = {
  id: "acc1",
  name: "Hôtel Cour du Corbeau",
  nightOf: { night: 3, of: 4 },
  checkOut: "2026-12-14",
  address: "6 Rue des Couples, Strasbourg",
  confirmation: "HX-4471",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  notes: "Door code 1942",
  lat: 48.5795,
  lng: 7.7498,
};
const bare = { ...tonight, address: null, confirmation: null, checkInTime: null, checkOutTime: null, notes: null, lat: null, lng: null };

function toggle() {
  return screen.getByRole("button", { name: /Hôtel Cour du Corbeau/ });
}

describe("TonightCard (spec 2026-09-29 D1)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("collapsed: a toggle button naming the bed, the night and the check-out day — tapping it never navigates", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Night 3 of 4 · check-out Mon 14 Dec")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect((toggle().closest('[data-slot="tonight-card"]') as HTMLElement).className).toContain("bg-lilac");
  });

  it("expands in place with every detail present and an 'Edit in plan' link to the Stop; tapping again collapses", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle().getAttribute("aria-controls")!) as HTMLElement;
    expect(within(panel).getByRole("link", { name: "6 Rue des Couples, Strasbourg" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=48.5795%2C7.7498",
    );
    expect(within(panel).getByText("HX-4471")).toBeInTheDocument();
    expect(within(panel).getByText("Check-in 15:00")).toBeInTheDocument();
    expect(within(panel).getByText("Check-out 11:00")).toBeInTheDocument();
    expect(within(panel).getByText("Door code 1942")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Edit in plan" })).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Edit in plan" })).toBeNull();
  });

  it("shows only the details that are present", () => {
    render(<TonightCard tripId="t1" tonight={bare} isLastDay={false} stopId="s1" size="phone" />);
    fireEvent.click(toggle());
    const panel = document.getElementById(toggle().getAttribute("aria-controls")!) as HTMLElement;
    expect(within(panel).queryByText(/Confirmation/)).toBeNull();
    expect(within(panel).queryByText(/Check-in/)).toBeNull();
    expect(within(panel).queryByText(/Check-out/)).toBeNull();
    expect(within(panel).getAllByRole("link")).toHaveLength(1);
    expect(within(panel).getByRole("link", { name: "Edit in plan" })).toBeInTheDocument();
  });

  it("copies the confirmation number to the clipboard", async () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Copy confirmation number" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("HX-4471");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("a bed with no Stop: 'Edit in plan' goes to the Plan", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId={null} size="phone" />);
    fireEvent.click(toggle());
    expect(screen.getByRole("link", { name: "Edit in plan" })).toHaveAttribute("href", "/trips/t1/plan");
  });

  it("no bed → 'No bed yet' and an add link to the Plan at that Stop", () => {
    render(<TonightCard tripId="t1" tonight={null} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("No bed yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Add a stay" })).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
  });

  it("hidden on the last day", () => {
    const { container } = render(<TonightCard tripId="t1" tonight={tonight} isLastDay stopId="s1" size="desktop" />);
    expect(container.firstChild).toBeNull();
  });
});
