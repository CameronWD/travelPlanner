import { describe, it, expect, vi, beforeEach, onTestFinished } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/item-form-dialog", () => ({
  ItemFormDialog: (p: { open: boolean; item?: { id: string } }) => (p.open ? <div data-testid="item-dialog">{p.item?.id}</div> : null),
}));
vi.mock("@/components/trip/transport-form-dialog", () => ({
  TransportFormDialog: (p: { open: boolean; transport?: { id: string }; attachments?: Array<{ id: string }>; partnerFiles?: Array<{ id: string }> }) =>
    p.open ? (
      <div data-testid="transport-dialog" data-own={p.attachments?.map((a) => a.id).join(",")} data-partner={p.partnerFiles?.map((a) => a.id).join(",")}>
        {p.transport?.id}
      </div>
    ) : null,
}));
vi.mock("@/components/trip/accommodation-form-dialog", () => ({
  AccommodationFormDialog: (p: { open: boolean; accommodation?: { id: string }; stopDateRange: { arriveDate: string } }) =>
    p.open ? <div data-testid="accommodation-dialog">{p.accommodation?.id}:{p.stopDateRange.arriveDate}</div> : null,
}));

import { DayEntryLink, type DayEntryEditor } from "./day-entry-link";

const editor: DayEntryEditor = {
  tripId: "t1", stops: [{ id: "s1", name: "Munich", arriveDate: "2026-12-08" }], homeCurrency: "AUD", homeBaseName: null,
  items: {}, transports: {}, accommodations: {}, costsByOwner: {}, readFirst: false,
};

describe("DayEntryLink", () => {
  it("is a button that opens the Item dialog for an item", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink editor={editor} attachments={[]} target={{ kind: "item", item: { id: "i1", bookingStateSet: false, endAddress: null, title: "Tower", category: "SIGHTSEEING" } }}>
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
      <DayEntryLink editor={editor} attachments={[]} target={{ kind: "transport", transport: { id: "tr1", bookingStateSet: false, mode: "TRAIN", sortOrder: 0 } }}>
        Departs — Train
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("tr1");
  });

  it("hands a Transport's dialog its own files to manage and its booking partner's files apart", async () => {
    const user = userEvent.setup();
    const file = (id: string, filedOn?: string) => ({ id, filename: `${id}.pdf`, mime: "application/pdf", size: 1, url: `/api/attachments/${id}`, uploadedById: "u1", createdAt: new Date(), filedOn });
    render(
      <DayEntryLink editor={editor} attachments={[file("own"), file("eticket", "DPS → BKK")]} target={{ kind: "transport", transport: { id: "tr1", bookingStateSet: false, mode: "FLIGHT", sortOrder: 0 } }}>
        Departs
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("transport-dialog")).toHaveAttribute("data-own", "own");
    expect(screen.getByTestId("transport-dialog")).toHaveAttribute("data-partner", "eticket");
  });

  it("opens the Accommodation dialog with the Stop's date range", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink
        editor={editor}
        attachments={[]}
        target={{
          kind: "accommodation",
          accommodation: { id: "a1", bookingStateSet: false, stopId: "s1", name: "Hotel", checkIn: "2026-12-08", checkOut: "2026-12-10" },
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

function setViewport(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width") ? phone : !phone,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe("DayEntryLink on the road (readFirst)", () => {
  const road: DayEntryEditor = { ...editor, readFirst: true };
  const item = { id: "i1", bookingStateSet: false, endAddress: null, title: "Tower", category: "SIGHTSEEING" } as const;
  const transport = { id: "tr1", bookingStateSet: false, endAddress: null, mode: "TRAIN", sortOrder: 0 } as const;

  beforeEach(() => setViewport(true));

  it("on a phone shows the details sheet, not the form", async () => {
    const user = userEvent.setup();
    render(<DayEntryLink editor={road} attachments={[]} target={{ kind: "item", item }}>Tower</DayEntryLink>);
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Tower");
    expect(screen.queryByTestId("item-dialog")).toBeNull();
  });

  it("Edit closes the sheet, then opens the form", async () => {
    const user = userEvent.setup();
    render(<DayEntryLink editor={road} attachments={[]} target={{ kind: "transport", transport }}>Train</DayEntryLink>);
    await user.click(screen.getByRole("button", { name: "Train" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("tr1");
  });

  it("on desktop opens the form directly", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<DayEntryLink editor={road} attachments={[]} target={{ kind: "item", item }}>Tower</DayEntryLink>);
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByTestId("item-dialog")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("in a planning phase on a phone opens the form directly", async () => {
    const user = userEvent.setup();
    render(<DayEntryLink editor={{ ...road, readFirst: false }} attachments={[]} target={{ kind: "item", item }}>Tower</DayEntryLink>);
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByTestId("item-dialog")).toBeInTheDocument();
  });

  it("a Surprise being sprung shows the masked title and no Edit", async () => {
    const user = userEvent.setup();
    const surprise = { plannerId: "p", plannerName: "Pat", forIds: ["v"], forNames: ["Viv"], youAreSurprised: true };
    render(
      <DayEntryLink editor={road} attachments={[]} target={{ kind: "item", item: { ...item, title: "Surprise", surprise } }}>
        Surprise
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button", { name: "Surprise" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Surprise");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("without matchMedia falls back to the phone layout, like the dialogs", async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    // @ts-expect-error simulating an environment with no matchMedia
    window.matchMedia = undefined;
    onTestFinished(() => {
      window.matchMedia = original;
    });
    render(<DayEntryLink editor={road} attachments={[]} target={{ kind: "item", item }}>Tower</DayEntryLink>);
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Tower");
  });
});
