import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCard, type TripCardModel } from "./trip-card";
import { TripCardHero } from "./trip-card-hero";

vi.mock("./trip-cover", () => ({ TripCover: (p: { size: string }) => <div data-testid="cover" data-size={p.size} /> }));
vi.mock("@/components/navigation/app-link", () => ({ AppLink: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

const cover = { tripId: "t1", name: "Christmas in Europe 2026", hue: "coral" as const, photo: null, stops: [], startDate: "2026-12-04", canEdit: true };
const hero: TripCardModel = {
  id: "t1", ref: "t1", name: "Christmas in Europe 2026", kind: "up-next", big: { value: "67", unit: ["sleeps", "to go"] },
  dateLine: "4 Dec – 8 Jan · 11 stops", href: "/trips/t1", cover, index: 0,
  nextStep: { id: "n1", title: "Add times to 6 transport legs", href: "/trips/t1/plan", tone: "sun", icon: "plane" },
};

describe("TripCardHero", () => {
  it("is one link named from name, status and countdown, with a sibling next-step link", () => {
    render(<TripCardHero model={hero} />);
    const card = screen.getByRole("link", { name: "Christmas in Europe 2026, up next, 67 sleeps to go" });
    expect(card).toHaveAttribute("href", "/trips/t1");
    const chip = screen.getByRole("link", { name: /Add times to 6 transport legs/ });
    expect(chip).toHaveAttribute("href", "/trips/t1/plan");
    expect(card.contains(chip)).toBe(false);
    expect(screen.getByText("UP NEXT")).toBeInTheDocument();
    expect(screen.getByText("67")).toBeInTheDocument();
    expect(screen.getByTestId("cover")).toHaveAttribute("data-size", "hero");
  });
  it("hides the chip when there is nothing to do", () => {
    render(<TripCardHero model={{ ...hero, nextStep: null }} />);
    expect(screen.queryByRole("link", { name: /transport/ })).toBeNull();
  });
  it("hides the chip for the all-sorted sentinel (null href)", () => {
    render(
      <TripCardHero
        model={{ ...hero, nextStep: { id: "all-sorted", title: "You're all sorted", href: null, tone: "teal", icon: "check" } }}
      />,
    );
    expect(screen.queryByRole("link", { name: /all sorted/i })).toBeNull();
  });
});

describe("TripCard", () => {
  it("renders the pill, big number, name and date line", () => {
    render(<TripCard model={{ ...hero, id: "t2", kind: "planning", big: { value: "208", unit: ["sleeps", "to go"] }, dateLine: "23 Apr – 3 May", name: "New Zealand", index: 1 }} />);
    expect(screen.getByRole("link", { name: "New Zealand, planning, 208 sleeps to go" })).toBeInTheDocument();
    expect(screen.getByText("PLANNING")).toBeInTheDocument();
    expect(screen.getByText("23 Apr – 3 May")).toBeInTheDocument();
    expect(screen.getByTestId("cover")).toHaveAttribute("data-size", "small");
  });
  it("idea cards link the date line to trip settings", () => {
    render(<TripCard model={{ ...hero, kind: "idea", big: { value: "?", unit: ["dates", "not set"] }, dateLine: "Add dates", index: 2 }} />);
    expect(screen.getByRole("link", { name: "Add dates" })).toHaveAttribute("href", "/trips/t1/settings");
  });
  it("done cards use the canvas fill", () => {
    const { container } = render(<TripCard model={{ ...hero, kind: "done", big: { value: "9", unit: ["nights", "away"] }, dateLine: "Mar 2025 · 4 stops", index: 0 }} />);
    expect(container.firstElementChild!.className).toContain("bg-canvas");
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });
  it("shows a slim Trip-colour strip on phones, where the cover is hidden", () => {
    const { container } = render(<TripCard model={{ ...hero, id: "t2", kind: "planning", name: "New Zealand", index: 1, cover: { ...cover, hue: "teal" } }} />);
    const strip = container.querySelector("[data-trip-colour-strip]") as HTMLElement;
    expect(strip).not.toBeNull();
    const c = strip.className.split(/\s+/);
    expect(c).toContain("bg-hue-teal");
    expect(c).toContain("md:hidden");
    expect(strip).toHaveAttribute("aria-hidden", "true");
  });
});
