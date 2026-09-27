import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TonightCard } from "@/components/trip/day/tonight-card";
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...r}>{children}</a> }));

const tonight = { id: "acc1", name: "Hôtel Cour du Corbeau", nightOf: { night: 3, of: 4 }, checkOut: "2026-12-14" };

describe("TonightCard", () => {
  // The Plan has Stop anchors (stop-card.tsx `id="stop-…"`) but no
  // per-Accommodation anchor, so the bed links to its Stop on the Plan.
  it("names the bed, the night and the check-out day, and links to the stay's Stop on the Plan", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByText("Hôtel Cour du Corbeau")).toBeInTheDocument();
    expect(screen.getByText("Night 3 of 4 · check-out Mon 14 Dec")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
    expect(screen.getByRole("link").className).toContain("bg-lilac");
  });
  it("a bed with no Stop links to the Plan", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId={null} size="phone" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips/t1/plan");
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
