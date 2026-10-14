import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BOOKING_IMPORT_MESSAGES as M } from "@/lib/booking-import/messages";
import type { BookingImportResult, ProposalBase } from "@/lib/booking-import/types";

const m = vi.hoisted(() => ({ importBooking: vi.fn(), confirmProposal: vi.fn(), uploadAttachment: vi.fn() }));
vi.mock("@/server/actions/booking-import", () => ({ importBooking: m.importBooking, confirmProposal: m.confirmProposal }));
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: m.uploadAttachment, deleteAttachment: vi.fn() }));
vi.mock("@/server/actions/costs", () => ({ createCost: vi.fn(), updateCost: vi.fn(), deleteCost: vi.fn() }));
vi.mock("@/server/actions/notes", () => ({ createNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("@/server/actions/votes", () => ({ upsertVote: vi.fn(), deleteVote: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/image-compress", () => ({ compressImage: async (f: File) => f, oversizeUploadMessage: () => null }));

import { BookingImportSheet } from "./booking-import-sheet";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };
const RESULT: BookingImportResult = {
  ok: true,
  partial: false,
  context: { homeName: "Brisbane", homeTimezone: "Australia/Brisbane", homeCurrency: "AUD", stops: [] },
  proposals: [
    { ...BASE, clientId: "s1", kind: "stop", input: { mode: "scheduled", name: "Lisbon", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" } },
    { ...BASE, clientId: "p1", kind: "transport", input: { mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", toStopId: "proposed:s1", arrAt: "2026-12-02T07:15", reference: "QX7P2M" } },
    { ...BASE, clientId: "p2", kind: "accommodation", input: { stopId: "proposed:s1", name: "Casa do Rio Lisboa", checkIn: "2026-12-02", checkOut: "2026-12-08" } },
  ],
};

function open() {
  return render(<BookingImportSheet tripId="trip-1" forkId="fork-1" open onOpenChange={vi.fn()} />);
}
async function pasteAndRead(text = "Flight SK101") {
  await userEvent.type(screen.getByLabelText("Or paste the booking text"), text);
  await userEvent.click(screen.getByRole("button", { name: "Read booking" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.importBooking.mockResolvedValue(RESULT);
  m.confirmProposal.mockResolvedValue({ ok: true, createdId: "t-new", createdStops: { s1: "stop-new" } });
  m.uploadAttachment.mockResolvedValue({ success: true, id: "att-1" });
});

describe("BookingImportSheet", () => {
  it("sends pasted text with the trip and the plan being viewed, then groups the Proposals under a New stop", async () => {
    open();
    await pasteAndRead();
    const fd = m.importBooking.mock.calls[0][0] as FormData;
    expect([fd.get("tripId"), fd.get("forkId"), fd.get("text"), fd.get("file")]).toEqual(["trip-1", "fork-1", "Flight SK101", null]);
    const group = await screen.findByRole("region", { name: "New stop: Lisbon" });
    expect(within(group).getByTestId("proposal-p1")).toBeInTheDocument();
    expect(within(group).getByTestId("proposal-p2")).toBeInTheDocument();
  });

  it("refuses a HEIC file before sending anything", async () => {
    open();
    await userEvent.upload(screen.getByLabelText("Booking file"), new File(["x"], "IMG.HEIC", { type: "image/heic" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(M.heic);
    expect(m.importBooking).not.toHaveBeenCalled();
  });

  it("shows a failure verbatim; not a booking offers another file", async () => {
    m.importBooking.mockResolvedValue({ ok: false, reason: "not_booking", message: M.notBooking("it is a newsletter") });
    open();
    await pasteAndRead();
    expect(await screen.findByRole("alert")).toHaveTextContent("This doesn't look like a booking: it is a newsletter.");
    await userEvent.click(screen.getByRole("button", { name: "Try another file" }));
    expect(screen.getByLabelText("Or paste the booking text")).toBeInTheDocument();
  });

  it("busy keeps the file and retries it", async () => {
    m.importBooking.mockResolvedValueOnce({ ok: false, reason: "busy", message: M.busy }).mockResolvedValueOnce(RESULT);
    open();
    const pdf = new File(["%PDF-1.4"], "ticket.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Booking file"), pdf);
    expect(await screen.findByRole("alert")).toHaveTextContent(M.busy);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("region", { name: "New stop: Lisbon" });
    expect((m.importBooking.mock.calls[1][0] as FormData).get("file")).toBeInstanceOf(File);
  });

  it("confirming a dependent saves its Stop with it, then attaches the original once", async () => {
    open();
    const pdf = new File(["%PDF-1.4"], "ticket.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Booking file"), pdf);
    await userEvent.click(within(await screen.findByTestId("proposal-p1")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(m.confirmProposal).toHaveBeenCalledTimes(1));
    const [tripId, request, forkId] = m.confirmProposal.mock.calls[0];
    expect([tripId, forkId]).toEqual(["trip-1", "fork-1"]);
    expect(request.proposal.clientId).toBe("p1");
    expect(request.proposedStops.map((s: { clientId: string }) => s.clientId)).toEqual(["s1"]);
    expect(request.resolvedStops).toEqual({});
    await waitFor(() => expect(m.uploadAttachment).toHaveBeenCalledTimes(1));
    const upload = m.uploadAttachment.mock.calls[0][0] as FormData;
    expect([upload.get("tripId"), upload.get("targetType"), upload.get("targetId")]).toEqual(["trip-1", "TRANSPORT", "t-new"]);

    m.confirmProposal.mockResolvedValue({ ok: true, createdId: "a-new", createdStops: {} });
    await userEvent.click(within(screen.getByTestId("proposal-p2")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(m.confirmProposal).toHaveBeenCalledTimes(2));
    expect(m.confirmProposal.mock.calls[1][1]).toMatchObject({ proposedStops: [], resolvedStops: { s1: "stop-new" } });
    expect(m.uploadAttachment).toHaveBeenCalledTimes(1);
  });

  it("a failed booking keeps its saved Stop and shows the error on the card", async () => {
    m.confirmProposal.mockResolvedValue({ ok: false, message: "Arrival must be after departure", createdStops: { s1: "stop-new" } });
    open();
    await pasteAndRead();
    await userEvent.click(within(await screen.findByTestId("proposal-p1")).getByRole("button", { name: "Confirm" }));
    expect(await within(screen.getByTestId("proposal-p1")).findByRole("alert")).toHaveTextContent("Arrival must be after departure");
    expect(within(screen.getByRole("region", { name: "New stop: Lisbon" })).getByText("Added")).toBeInTheDocument();
    expect(m.uploadAttachment).not.toHaveBeenCalled(); // pasted text attaches nothing anyway
  });

  it("discarding a proposed Stop discards what depends on it", async () => {
    open();
    await pasteAndRead();
    const group = await screen.findByRole("region", { name: "New stop: Lisbon" });
    await userEvent.click(within(group).getAllByRole("button", { name: "Discard" })[0]);
    expect(screen.queryByTestId("proposal-p1")).toBeNull();
    expect(screen.queryByTestId("proposal-p2")).toBeNull();
  });
});
