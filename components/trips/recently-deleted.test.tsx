import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { push, restoreTrip, toastMock } = vi.hoisted(() => ({
  push: vi.fn(),
  restoreTrip: vi.fn(),
  toastMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/server/actions/trips", () => ({ restoreTrip }));
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

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

  it("shows the elapsed/remaining days line, pluralised", () => {
    render(<RecentlyDeleted trips={[trip({})]} now={NOW} />);
    expect(screen.getByText("Deleted 3 days ago · gone in 27 days")).toBeInTheDocument();
  });

  it("singularises 'day' at exactly 1 elapsed / 1 remaining", () => {
    render(
      <RecentlyDeleted
        trips={[trip({ deletedAt: new Date("2026-10-01T00:00:00Z") })]}
        now={new Date("2026-10-30T00:00:00Z")}
      />,
    );
    expect(screen.getByText("Deleted 29 days ago · gone in 1 day")).toBeInTheDocument();
  });

  it("singularises both sides at 1 day elapsed", () => {
    render(
      <RecentlyDeleted
        trips={[trip({ deletedAt: new Date("2026-10-01T00:00:00Z") })]}
        now={new Date("2026-10-02T00:00:00Z")}
      />,
    );
    expect(screen.getByText("Deleted 1 day ago · gone in 29 days")).toBeInTheDocument();
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
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("shows a destructive toast with the server's error when restore fails, and does not navigate", async () => {
    restoreTrip.mockResolvedValue({ success: false, error: "Only the trip owner can restore the trip." });
    render(<RecentlyDeleted trips={[trip({})]} now={NOW} />);
    screen.getByRole("button", { name: "Restore" }).click();
    await vi.waitFor(() => expect(restoreTrip).toHaveBeenCalledWith("t1"));
    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't restore.",
          description: "Only the trip owner can restore the trip.",
          variant: "destructive",
        }),
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
