import { describe, it, expect, vi, onTestFinished } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/server/actions/items", () => ({ unscheduleItem: vi.fn(), setTryEntry: vi.fn() }));
vi.mock("@/server/actions/booking-confirmation", () => ({ setNothingToAttach: vi.fn() }));
vi.mock("@/components/trip/item-form-dialog", () => ({ ItemFormDialog: () => <div data-testid="item-dialog" /> }));
vi.mock("@/components/trip/transport-form-dialog", () => ({ TransportFormDialog: () => <div data-testid="transport-dialog" /> }));
vi.mock("@/components/trip/accommodation-form-dialog", () => ({ AccommodationFormDialog: () => null }));

import { Timeline } from "./timeline";
import type { DayEntryEditor } from "./day-entry-link";
import type { DayPlan } from "@/lib/itinerary";

const day: DayPlan = {
  dateISO: "2025-07-01",
  stop: { id: "s1", name: "Tokyo", timezone: "Asia/Tokyo", arriveDate: "2025-07-01", departDate: "2025-07-03", sortOrder: 0 },
  timedItems: [{ kind: "item", item: { id: "i1", title: "Tower", category: "SIGHTSEEING", date: "2025-07-01", startTime: "10:00" } }],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [],
};
const editor: DayEntryEditor = {
  tripId: "t1", stops: [], readFirst: true, transports: {}, accommodations: {}, costsByOwner: {},
  items: { i1: { id: "i1", title: "Tower", category: "SIGHTSEEING", bookingStateSet: false } },
};

describe("Timeline rows while Travelling on a phone", () => {
  it("the title opens the details sheet; the attachment link and the directions arrow do not", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width"), media: query, addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const user = userEvent.setup();
    const file = { id: "a1", filename: "ticket.pdf", title: null, mime: "application/pdf", size: 1, url: "#a1", uploadedById: "u1", createdAt: new Date(0) };
    render(
      <Timeline
        day={day}
        variant="day"
        editor={editor}
        attachmentsByTarget={{ i1: [file] }}
        itemDirections={{ i1: { google: "https://maps.example/g", apple: "https://maps.example/a" } }}
      />,
    );
    const files = screen.getByRole("link", { name: /ticket/i });
    const arrow = screen.getByRole("link", { name: /directions/i });
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    onTestFinished(() => open.mockRestore());
    const stopNavigation = (e: Event) => e.preventDefault();
    document.addEventListener("click", stopNavigation, true);
    onTestFinished(() => document.removeEventListener("click", stopNavigation, true));
    await user.click(files);
    await user.click(arrow);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Tower");
    expect(screen.queryByTestId("item-dialog")).toBeNull();
  });
});
