import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/server/actions/costs", () => ({ createCost: vi.fn(), updateCost: vi.fn(), deleteCost: vi.fn() }));
vi.mock("@/server/actions/notes", () => ({ createNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));
vi.mock("@/server/actions/votes", () => ({ upsertVote: vi.fn(), deleteVote: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
import { ProposalCard } from "./proposal-card";
import { previewStopMap } from "@/lib/booking-import/preview";
import { BOOKING_IMPORT_MESSAGES as M } from "@/lib/booking-import/messages";
import type { AccommodationProposal, ImportContext, ProposalBase, TransportProposal } from "@/lib/booking-import/types";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "medium", doubleCheck: ["The fare covers both flights."], warnings: [], highlight: ["reference"], missing: ["Arrival time"], duplicateOf: null, blocked: null };
const CONTEXT: ImportContext = {
  homeName: "Brisbane",
  homeTimezone: "Australia/Brisbane",
  homeCurrency: "AUD",
  stops: [{ id: "s-lis", name: "Lisbon", country: "Portugal", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08", sortOrder: 0 }],
};
const STOPS = previewStopMap(CONTEXT, []);
const FLIGHT: TransportProposal = {
  ...BASE,
  clientId: "p1",
  kind: "transport",
  input: { mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", toStopId: "s-lis", reference: "QX7P2M", costMinor: 214_000, currency: "AUD", paidMinor: 214_000, paidAt: "2026-10-01" },
};
const handlers = () => ({ onConfirm: vi.fn(), onEdit: vi.fn(), onDiscard: vi.fn() });

describe("ProposalCard", () => {
  it("shows the real card marked Preview, with confidence, cost, notes and what's missing", () => {
    const { container } = render(<ProposalCard proposal={FLIGHT} stops={STOPS} homeName="Brisbane" homeTimezone="Australia/Brisbane" status="pending" {...handlers()} />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Check the details")).toBeInTheDocument();
    expect(screen.getByTestId("transport-heading")).toHaveTextContent("Brisbane");
    expect(screen.getByTestId("transport-heading")).toHaveTextContent("Lisbon");
    expect(container.querySelector('[data-highlight="reference"]')).toHaveTextContent("QX7P2M");
    expect(screen.getByText(/\$2,140\.00 · Paid/)).toBeInTheDocument();
    expect(screen.getByText("The fare covers both flights.")).toBeInTheDocument();
    expect(screen.getByText("Not in the booking: Arrival time")).toBeInTheDocument();
  });

  it("Confirm, Edit and Discard call back", async () => {
    const h = handlers();
    render(<ProposalCard proposal={FLIGHT} stops={STOPS} homeName="Brisbane" homeTimezone={null} status="pending" {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(h.onConfirm).toHaveBeenCalledOnce();
    expect(h.onEdit).toHaveBeenCalledOnce();
    expect(h.onDiscard).toHaveBeenCalledOnce();
  });

  it("a blocked Proposal says why and can't be confirmed or edited", () => {
    render(<ProposalCard proposal={{ ...FLIGHT, blocked: M.blocked }} stops={STOPS} homeName={null} homeTimezone={null} status="pending" {...handlers()} />);
    expect(screen.getByText(M.blocked)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  it("shows warnings and a confirm error", () => {
    render(<ProposalCard proposal={{ ...FLIGHT, warnings: [M.duplicate("Flight QX7P2M")] }} stops={STOPS} homeName={null} homeTimezone={null} status="pending" error="Arrival must be after departure" {...handlers()} />);
    expect(screen.getByText(M.duplicate("Flight QX7P2M"))).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Arrival must be after departure");
  });

  it("a confirmed Proposal reads Added with no buttons; a discarded one renders nothing", () => {
    const { rerender, container } = render(<ProposalCard proposal={FLIGHT} stops={STOPS} homeName={null} homeTimezone={null} status="confirmed" {...handlers()} />);
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    rerender(<ProposalCard proposal={FLIGHT} stops={STOPS} homeName={null} homeTimezone={null} status="discarded" {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("an Accommodation outside its Stop's dates shows the card's own date warning", () => {
    const stay: AccommodationProposal = { ...BASE, clientId: "p3", kind: "accommodation", highlight: [], missing: [], input: { stopId: "s-lis", name: "Casa do Rio Lisboa", checkIn: "2026-12-01", checkOut: "2026-12-08" } };
    render(<ProposalCard proposal={stay} stops={STOPS} homeName={null} homeTimezone={null} status="pending" {...handlers()} />);
    expect(screen.getByText("Check-in is before you arrive in this stop")).toBeInTheDocument();
  });
});
