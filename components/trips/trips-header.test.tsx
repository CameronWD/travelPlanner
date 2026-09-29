import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripsHeader } from "./trips-header";

vi.mock("@/components/trips/trip-carousel", () => ({ CarouselArrows: () => <div data-testid="arrows" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

describe("TripsHeader greeting (Feedback cmumchfzu000104l0cv755cz8)", () => {
  it("shows no greeting line on a normal visit — the heading is the page", () => {
    render(<TripsHeader firstName="Cam" metaLine="2 trips" firstRun={false} />);
    expect(screen.queryByText(/Hey Cam/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Your trips" })).toBeInTheDocument();
  });

  it("keeps the first-run welcome, which has a job to do", () => {
    render(<TripsHeader firstName="Cam" metaLine="" firstRun />);
    expect(screen.getByText("Welcome to teepee, Cam")).toBeInTheDocument();
  });
});
