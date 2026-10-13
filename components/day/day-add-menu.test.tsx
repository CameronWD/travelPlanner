import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { DayAddMenu } from "./day-add-menu";

vi.mock("@/components/trip/item-form-dialog", () => ({
  ItemFormDialog: (p: { open: boolean; defaultStopId?: string | null; defaultDate?: string }) =>
    p.open ? <div data-testid="item-dialog">{p.defaultStopId}|{p.defaultDate}</div> : null,
}));
vi.mock("@/components/trip/transport-form-dialog", () => ({
  TransportFormDialog: (p: { open: boolean; defaultFromStopId?: string; defaultToStopId?: string; defaultDate?: string; settingsHref?: string }) =>
    p.open ? <div data-testid="transport-dialog">{p.defaultFromStopId}|{p.defaultToStopId}|{p.defaultDate}|{p.settingsHref}</div> : null,
}));

const base = {
  tripId: "t", slug: "cairns-work", date: "2026-11-04",
  stop: { id: "s1", arriveDate: "2026-11-04", departDate: "2026-11-05" },
  stopOptions: [{ id: "s1", name: "Cairns", arriveDate: "2026-11-04", departDate: "2026-11-05", timezone: "Australia/Brisbane", sortOrder: 0 }],
  homeCurrency: "AUD", homeBaseName: null, label: "Add to this day", variant: "primary" as const, size: "md" as const,
};

describe("DayAddMenu (spec 2026-10-13 D5)", () => {
  it("offers Something to do and A flight, train or drive", async () => {
    render(<DayAddMenu {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    expect(screen.getByRole("menuitem", { name: "Something to do" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "A flight, train or drive" })).toBeInTheDocument();
  });
  it("Something to do opens the Item dialog with the day and its Stop", async () => {
    render(<DayAddMenu {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Something to do" }));
    expect(screen.getByTestId("item-dialog")).toHaveTextContent("s1|2026-11-04");
  });
  it("A flight opens the Transport dialog with day-derived endpoints, the date and the settings link", async () => {
    render(<DayAddMenu {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "A flight, train or drive" }));
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("__home__|s1|2026-11-04|/trips/cairns-work/settings");
  });
  it("on a changeover day the flight comes from the previous Stop (final review F3)", async () => {
    const stopOptions = [
      { id: "s0", name: "Brisbane", arriveDate: "2026-11-01", departDate: "2026-11-04", timezone: "Australia/Brisbane", sortOrder: 0 },
      { ...base.stopOptions[0], sortOrder: 1 },
    ];
    render(<DayAddMenu {...base} stopOptions={stopOptions} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "A flight, train or drive" }));
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("s0|s1|2026-11-04|/trips/cairns-work/settings");
  });
  describe("a gap day with no Stop (final review F7)", () => {
    it("Something to do opens the Item dialog with no Stop", async () => {
      render(<DayAddMenu {...base} stop={null} />);
      await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Something to do" }));
      expect(screen.getByTestId("item-dialog")).toHaveTextContent(/^\|2026-11-04$/);
    });
    it("A flight, train or drive opens the Transport dialog with both endpoints empty", async () => {
      render(<DayAddMenu {...base} stop={null} />);
      await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "A flight, train or drive" }));
      expect(screen.getByTestId("transport-dialog")).toHaveTextContent(/^\|\|2026-11-04\|\/trips\/cairns-work\/settings$/);
    });
  });
});
