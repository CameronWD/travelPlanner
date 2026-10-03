import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { push, restoreTrip } = vi.hoisted(() => ({ push: vi.fn(), restoreTrip: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/server/actions/trips", () => ({ restoreTrip }));

import { RecentlyDeleted } from "./recently-deleted";

const NOW = new Date("2026-10-02T00:00:00Z");

function trip(over: Record<string, unknown>) {
  return { id: "t1", name: "Japan 2026", slug: "japan-2026", deletedAt: new Date("2026-09-29T00:00:00Z"), ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecentlyDeleted", () => {
  it("renders null for an empty list", () => {
    const { container } = render(<RecentlyDeleted trips={[]} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading", () => {
    render(<RecentlyDeleted trips={[trip({})]} now={NOW} />);
    expect(screen.getByRole("heading", { name: "Recently deleted" })).toBeInTheDocument();
  });

  it("shows the elapsed/remaining days line", () => {
    render(<RecentlyDeleted trips={[trip({})]} now={NOW} />);
    expect(screen.getByText("Deleted 3 day(s) ago · gone in 27 days")).toBeInTheDocument();
  });

  it("renders a Restore button per Trip", () => {
    render(<RecentlyDeleted trips={[trip({ id: "a" }), trip({ id: "b", name: "NZ" })]} now={NOW} />);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("restores and navigates to the Trip on success", async () => {
    restoreTrip.mockResolvedValue({ success: true, slug: "japan-2026" });
    render(<RecentlyDeleted trips={[trip({})]} now={NOW} />);
    screen.getByRole("button", { name: "Restore" }).click();
    await vi.waitFor(() => expect(restoreTrip).toHaveBeenCalledWith("t1"));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/trips/japan-2026"));
  });
});
