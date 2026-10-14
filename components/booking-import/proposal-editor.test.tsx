import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportContext, ProposalBase, Proposal, StopProposal } from "@/lib/booking-import/types";
import { previewStopMap } from "@/lib/booking-import/preview";

// The form dialogs' server actions (as their own tests mock them), so nothing reaches a database.
vi.mock("@/server/actions/transport", () => ({ createTransport: vi.fn(), updateTransport: vi.fn() }));
vi.mock("@/server/actions/accommodation", () => ({ createAccommodation: vi.fn(), updateAccommodation: vi.fn() }));
vi.mock("@/server/actions/items", () => ({ createItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn() }));
vi.mock("@/server/actions/item-photo", () => ({ setItemPhoto: vi.fn(), removeItemPhoto: vi.fn() }));
vi.mock("@/server/actions/stops", () => ({ createStop: vi.fn(), updateStop: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: vi.fn().mockResolvedValue([]) }));
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));
vi.mock("@/server/actions/notes", () => ({ createNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("@/server/actions/costs", () => ({ createCost: vi.fn(), updateCost: vi.fn(), deleteCost: vi.fn() }));
vi.mock("@/server/actions/votes", () => ({ upsertVote: vi.fn(), deleteVote: vi.fn() }));
vi.mock("@/components/trip/ai-booking-parser", () => ({ AiBookingParser: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

import { createAccommodation } from "@/server/actions/accommodation";
import { createTransport } from "@/server/actions/transport";
import { ProposalEditor } from "./proposal-editor";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };
const CONTEXT: ImportContext = { homeName: "Brisbane", homeTimezone: null, homeCurrency: "AUD", stops: [] };
const STOP: StopProposal = { ...BASE, clientId: "s1", kind: "stop", input: { mode: "scheduled", name: "Lisbon", country: "Portugal", countryCode: "PT", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" } };
const STAY: Proposal = { ...BASE, clientId: "p2", kind: "accommodation", input: { stopId: "proposed:s1", name: "Casa do Rio Lisboa", checkIn: "2026-12-02", checkOut: "2026-12-08" } };
const FLIGHT: Proposal = { ...BASE, clientId: "p1", kind: "transport", input: { mode: "FLIGHT", depIsHome: true, depTimezone: "Australia/Brisbane", depAt: "2026-12-01T10:00", toStopId: "proposed:s1", arrAt: "2026-12-02T07:15", reference: "QX7P2M" } };

type EditorProps = React.ComponentProps<typeof ProposalEditor>;

/** Feeds each draft back in as the live Proposal, as the sheet does. */
function Harness({ initial, original = initial, onConfirm, onClose = vi.fn() }: { initial: Proposal; original?: Proposal; onConfirm: EditorProps["onConfirm"]; onClose?: () => void }) {
  const [proposal, setProposal] = React.useState(initial);
  return (
    <ProposalEditor
      tripId="trip-1"
      forkId={null}
      context={CONTEXT}
      proposal={proposal}
      original={original}
      stopProposals={[STOP]}
      stops={previewStopMap(CONTEXT, [STOP])}
      onDraft={setProposal}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ProposalEditor", () => {
  it("opens the stay in the Accommodation form with a live preview, then confirms the edited stay", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, createdId: "a-new", createdStops: {} });
    const onClose = vi.fn();
    render(<Harness initial={STAY} onConfirm={onConfirm} onClose={onClose} />);
    const preview = screen.getByTestId("proposal-preview");
    expect(within(preview).getByText("Casa do Rio Lisboa")).toBeInTheDocument();

    const name = screen.getByDisplayValue("Casa do Rio Lisboa");
    await userEvent.clear(name);
    await userEvent.type(name, "Casa Nova");
    expect(within(preview).getByText("Casa Nova")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ clientId: "p2", input: expect.objectContaining({ name: "Casa Nova", stopId: "proposed:s1" }) }));
    expect(createAccommodation).not.toHaveBeenCalled();
  });

  it("shows a confirm failure in the form and stays open", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, message: "Check-out must be after check-in", createdStops: {} });
    const onClose = vi.fn();
    render(<Harness initial={STAY} onConfirm={onConfirm} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Check-out must be after check-in")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a Transport end's zone hint through the edit form", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, createdId: "t-new", createdStops: {} });
    render(<Harness initial={FLIGHT} onConfirm={onConfirm} />);
    expect(screen.getByTestId("proposal-preview")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const sent = onConfirm.mock.calls[0][0] as Extract<Proposal, { kind: "transport" }>;
    expect(sent.input).toMatchObject({ mode: "FLIGHT", depIsHome: true, depTimezone: "Australia/Brisbane", toStopId: "proposed:s1", reference: "QX7P2M" });
    expect(sent.input).not.toHaveProperty("anchorStopId");
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("edits a proposed Stop in the Stop form, keeping its country code", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, createdId: "stop-new", createdStops: { s1: "stop-new" } });
    render(<Harness initial={STOP} onConfirm={onConfirm} />);
    expect(screen.queryByTestId("proposal-preview")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect((onConfirm.mock.calls[0][0] as StopProposal).input).toEqual(STOP.input);
  });

  it("merges zone hints against the Proposal as it was, not the live draft (fix round 1)", async () => {
    // A draft whose departure end was cleared (dropping the hint) and then re-picked as Home again.
    const { depTimezone: _hint, ...withoutHint } = (FLIGHT as Extract<Proposal, { kind: "transport" }>).input;
    void _hint;
    const draft: Proposal = { ...FLIGHT, kind: "transport", input: withoutHint };
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, createdId: "t-new", createdStops: {} });
    render(<Harness initial={draft} original={FLIGHT} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect((onConfirm.mock.calls[0][0] as Extract<Proposal, { kind: "transport" }>).input).toMatchObject({ depIsHome: true, depTimezone: "Australia/Brisbane" });
  });
});
