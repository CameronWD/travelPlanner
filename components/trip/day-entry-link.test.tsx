import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/item-form-dialog", () => ({
  ItemFormDialog: (p: { open: boolean; item?: { id: string } }) => (p.open ? <div data-testid="item-dialog">{p.item?.id}</div> : null),
}));
vi.mock("@/components/trip/transport-form-dialog", () => ({
  TransportFormDialog: (p: { open: boolean; transport?: { id: string } }) => (p.open ? <div data-testid="transport-dialog">{p.transport?.id}</div> : null),
}));
vi.mock("@/components/trip/accommodation-form-dialog", () => ({
  AccommodationFormDialog: (p: { open: boolean; accommodation?: { id: string }; stopDateRange: { arriveDate: string } }) =>
    p.open ? <div data-testid="accommodation-dialog">{p.accommodation?.id}:{p.stopDateRange.arriveDate}</div> : null,
}));

import { DayEntryLink, type DayEntryEditor } from "./day-entry-link";

const editor: DayEntryEditor = {
  tripId: "t1", stops: [{ id: "s1", name: "Munich", arriveDate: "2026-12-08" }], homeCurrency: "AUD", homeBaseName: null,
  items: {}, transports: {}, accommodations: {}, costsByOwner: {},
};

describe("DayEntryLink", () => {
  it("is a button that opens the Item dialog for an item", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink editor={editor} attachments={[]} target={{ kind: "item", item: { id: "i1", title: "Tower", category: "SIGHTSEEING" } }}>
        Tower
      </DayEntryLink>,
    );
    expect(screen.queryByTestId("item-dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByTestId("item-dialog")).toHaveTextContent("i1");
  });

  it("opens the Transport dialog for a transport", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink editor={editor} attachments={[]} target={{ kind: "transport", transport: { id: "tr1", mode: "TRAIN", sortOrder: 0 } }}>
        Departs — Train
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("tr1");
  });

  it("opens the Accommodation dialog with the Stop's date range", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink
        editor={editor}
        attachments={[]}
        target={{
          kind: "accommodation",
          accommodation: { id: "a1", stopId: "s1", name: "Hotel", checkIn: "2026-12-08", checkOut: "2026-12-10" },
          stopDateRange: { arriveDate: "2026-12-08", departDate: "2026-12-10" },
        }}
      >
        Check-in — Hotel
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("accommodation-dialog")).toHaveTextContent("a1:2026-12-08");
  });
});
