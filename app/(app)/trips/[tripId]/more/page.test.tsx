import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const requireTripAccess = vi.fn();
vi.mock("@/lib/guards", () => ({ requireTripAccess: (id: string) => requireTripAccess(id) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import TripMorePage, { metadata } from "./page";

beforeEach(() => requireTripAccess.mockReset());

async function renderPage() {
  render(await TripMorePage({ params: Promise.resolve({ tripId: "t1" }) }));
}

describe("the trip's More page", () => {
  it("is titled More", () => {
    expect(metadata.title).toBe("More");
  });

  it("guards access before rendering", async () => {
    await renderPage();
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
  });

  it("tops out at <h2>, because the trip layout owns the page <h1>", async () => {
    await renderPage();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("More");
  });

  it("shows seven section tiles, each a link to its route, Help last", async () => {
    await renderPage();
    const tiles = within(screen.getByRole("list", { name: "Trip sections" })).getAllByRole("link");
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual([
      "/trips/t1/summary",
      "/trips/t1/journal",
      "/trips/t1/checklists",
      "/trips/t1/files",
      "/trips/t1/activity",
      "/trips/t1/settings",
      "/trips/t1/help",
    ]);
    expect(tiles[0]).toHaveTextContent("Summary");
    expect(tiles[0]).toHaveTextContent("The whole trip at a glance");
    expect(tiles[6]).toHaveTextContent("Help");
    expect(tiles[6]).toHaveTextContent("How to use Teepee");
  });

  it("describes every section in one line", async () => {
    await renderPage();
    for (const line of [
      "What happened, day by day",
      "Things to tick off before and during",
      "Tickets, bookings and documents",
      "What everyone's changed",
      "Travellers, sharing, digests and details",
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });
});
