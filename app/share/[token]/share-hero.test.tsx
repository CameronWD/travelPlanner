import { describe, it, expect, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";

vi.mock("@/components/ui/traveller-avatar", () => ({
  TravellerAvatar: ({ traveller }: { traveller: { name: string; image: string | null } }) => (
    <span data-testid="avatar" data-image={traveller.image ?? ""}>{traveller.name}</span>
  ),
}));

import { ShareHero, type ShareHeroProps } from "./share-hero";

const base: ShareHeroProps = {
  stage: "before",
  name: "Christmas in Europe",
  startDate: "2026-12-04",
  endDate: "2027-01-08",
  totalNights: 35,
  stopCount: 6,
  countdown: { n: 67, unit: "sleeps" },
  progress: null,
  travellers: [],
  coverStops: [
    { id: "a", name: "London", lat: 51.5, lng: -0.1, nights: 5 },
    { id: "b", name: "Paris", lat: 48.9, lng: 2.35, nights: 5 },
  ],
  refKey: "abc",
};
const hero = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot='share-hero']") as HTMLElement;

describe("ShareHero (SHARE.md §3)", () => {
  it("is the coral card with the trip name as the only h1", () => {
    render(<ShareHero {...base} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(hero().className).toMatch(/\bbg-coral\b/);
    expect(hero().className).toMatch(/\bshadow-hard-5\b/);
    expect(hero().className).not.toMatch(/shadow-soft/);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-balance");
  });

  it("before: SHARED TRIP / UP NEXT pill, day-range sub line, sleeps countdown", () => {
    render(<ShareHero {...base} />);
    expect(within(hero()).getByText("Shared trip")).toBeInTheDocument();
    expect(within(hero()).getByText("Up next")).toBeInTheDocument();
    expect(within(hero()).getByText("Fri 4 Dec – Fri 8 Jan · 35 nights · 6 stops")).toBeInTheDocument();
    // The digits count up (S4); the label is always the final value.
    expect(within(hero()).getByLabelText("67")).toBeInTheDocument();
    expect(within(hero()).getByText(/sleeps/)).toBeInTheDocument();
  });

  it("during: live pill with the day count and a progress bar at day/total", () => {
    render(<ShareHero {...base} stage="during" countdown={null} progress={{ day: 9, total: 36, fraction: 0.25, nightsLeft: 27 }} />);
    expect(within(hero()).getByText("On the road · Day 9 of 36")).toBeInTheDocument();
    expect(hero().querySelector("[data-live-dot]")).not.toBeNull();
    const bar = within(hero()).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "9");
    expect(within(hero()).getByText("27 nights to go")).toBeInTheDocument();
  });

  it("after: HOME AGAIN, month span only, no number, polaroid shown on mobile too, sketch solid", () => {
    const { container } = render(<ShareHero {...base} stage="after" countdown={null} />);
    expect(within(hero()).getByText("Home again")).toBeInTheDocument();
    expect(within(hero()).getByText("Dec 2026 – Jan 2027")).toBeInTheDocument();
    expect(within(hero()).queryByLabelText("67")).not.toBeInTheDocument();
    const polaroid = container.querySelector("[data-share-polaroid]")!;
    expect(polaroid.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(polaroid.querySelector("polyline")!.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("before: the polaroid is desktop-only and dashed", () => {
    const { container } = render(<ShareHero {...base} />);
    const polaroid = container.querySelector("[data-share-polaroid]")!;
    expect(polaroid.className).toMatch(/\bhidden\b.*\blg:block\b|\blg:block\b.*\bhidden\b/);
    expect(polaroid.querySelector("polyline")!.getAttribute("stroke-dasharray")).toBe("3 2.5");
  });

  it("shows no travellers unless given some; with them, names and link-scoped photos", () => {
    const { rerender } = render(<ShareHero {...base} />);
    expect(screen.queryByTestId("avatar")).not.toBeInTheDocument();
    rerender(
      <ShareHero
        {...base}
        travellers={[
          { id: "u1", name: "Cameron", firstName: "Cameron", image: "/share/tok/traveller-photo/u1?v=1", focalX: null, focalY: null },
          { id: "u2", name: "Sam", firstName: "Sam", image: null, focalX: null, focalY: null },
        ]}
      />,
    );
    expect(screen.getAllByTestId("avatar")[0]).toHaveAttribute("data-image", "/share/tok/traveller-photo/u1?v=1");
    expect(screen.getByText("Cameron & Sam's trip")).toBeInTheDocument();
  });

  describe("motion (MOTION.md S1–S4)", () => {
    it("the hero drops in and the polaroid lands after it", () => {
      const { container } = render(<ShareHero {...base} />);
      expect(hero().className).toMatch(/\btp-share-hero-in\b/);
      expect(container.querySelector("[data-share-polaroid]")!.className).toMatch(/\btp-share-polaroid-in\b/);
    });

    it("during: the live dot's ring pulses and the progress fill grows in from 0 to its value", () => {
      render(<ShareHero {...base} stage="during" countdown={null} progress={{ day: 9, total: 36, fraction: 0.25, nightsLeft: 27 }} />);
      expect(hero().querySelector("[data-live-dot]")!.className).toMatch(/\btp-live-ring\b/);
      const fill = hero().querySelector("[data-slot='share-progress-fill']") as HTMLElement;
      expect(fill.className).toMatch(/\btp-progress-fill\b/);
      expect(fill.style.transform).toBe("scaleX(0.25)");
    });

    it("before: an inline script marks the countdown pending before paint, keyed by the hashed ref only", () => {
      const { container } = render(<ShareHero {...base} refKey="abc" />);
      const counter = within(hero()).getByLabelText("67");
      const script = counter.nextElementSibling as HTMLScriptElement;
      expect(script.tagName).toBe("SCRIPT");
      expect(script.textContent).toContain('"tp-share-count:abc"');
      expect(script.textContent).toContain("prefers-reduced-motion: reduce");
      expect(script.textContent).toContain("data-count-pending");
      expect(script.textContent).toMatch(/try\s*\{/);
      expect(container.innerHTML).not.toContain("tok");
    });

    it("the script can't be closed early by the ref", () => {
      render(<ShareHero {...base} refKey={"</script><b>x"} />);
      const script = within(hero()).getByLabelText("67").nextElementSibling as HTMLScriptElement;
      expect(script.textContent).not.toContain("</script>");
      expect(script.textContent).toContain("\\u003c/script>");
    });

    it("the script sets data-count-pending only when the count will play", () => {
      render(<ShareHero {...base} refKey="abc" />);
      const counter = within(hero()).getByLabelText("67");
      const code = (counter.nextElementSibling as HTMLScriptElement).textContent!;
      const run = () => new Function("document", code)({ currentScript: { previousElementSibling: counter } });
      sessionStorage.clear();
      run();
      expect(counter).toHaveAttribute("data-count-pending");
      counter.removeAttribute("data-count-pending");
      sessionStorage.setItem("tp-share-count:abc", "1");
      run();
      expect(counter).not.toHaveAttribute("data-count-pending");
    });

    it("before: the countdown plays once per session under the link's hashed ref", async () => {
      sessionStorage.clear();
      render(<ShareHero {...base} />);
      await act(async () => {});
      expect(sessionStorage.getItem("tp-share-count:abc")).toBe("1");
    });
  });
});
