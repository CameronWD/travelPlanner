import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ShareLinkView } from "@/server/actions/share";

const createShareLink = vi.fn();
const updateShareLink = vi.fn();
const rotateShareLink = vi.fn();
const revokeShareLink = vi.fn();
vi.mock("@/server/actions/share", () => ({
  get createShareLink() { return createShareLink; },
  get updateShareLink() { return updateShareLink; },
  get rotateShareLink() { return rotateShareLink; },
  get revokeShareLink() { return revokeShareLink; },
}));

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
});

import { ShareLinksPanel } from "./share-links-panel";

const link = (over: Partial<ShareLinkView> = {}): ShareLinkView => ({
  id: "l1",
  token: "tok-1",
  label: "Mum & Dad",
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  createdAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  createShareLink.mockReset();
  updateShareLink.mockReset();
  rotateShareLink.mockReset();
  revokeShareLink.mockReset();
});

describe("ShareLinksPanel", () => {
  it("renders each link with its label and scope caption", () => {
    render(
      <ShareLinksPanel
        tripId="t"
        initialLinks={[link(), link({ id: "l2", token: "tok-2", label: "Group chat", includeDailyPlans: false })]}
      />,
    );
    expect(screen.getByText("Mum & Dad")).toBeInTheDocument();
    expect(screen.getByText("Full itinerary")).toBeInTheDocument();
    expect(screen.getByText("Group chat")).toBeInTheDocument();
    expect(screen.getByText("Route & dates · Accommodation · Transport")).toBeInTheDocument();
  });

  it("creates a link with the typed label and dial choices, all dials defaulting on", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", includeTransport: false }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(screen.getByLabelText("Transport")); // untick one dial
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createShareLink).toHaveBeenCalledWith("t", {
      label: "Nana",
      includeAccommodation: true,
      includeTransport: false,
      includeDailyPlans: true,
    });
    expect(await screen.findByText("Nana")).toBeInTheDocument();
  });

  it("shows the label error when create fails validation", async () => {
    createShareLink.mockResolvedValue({ success: false, errors: { label: ["Give this link a label (1–60 characters) — who is it for?"] } });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText(/give this link a label/i)).toBeInTheDocument();
  });

  it("revokes only the clicked link", async () => {
    revokeShareLink.mockResolvedValue({ success: true });
    render(<ShareLinksPanel tripId="t" initialLinks={[link(), link({ id: "l2", token: "tok-2", label: "Group chat" })]} />);
    await userEvent.click(screen.getAllByRole("button", { name: /revoke/i })[1]);
    expect(revokeShareLink).toHaveBeenCalledWith("t", "l2");
    expect(screen.queryByText("Group chat")).not.toBeInTheDocument();
    expect(screen.getByText("Mum & Dad")).toBeInTheDocument();
  });

  it("shows the error and keeps the row when revoke fails", async () => {
    revokeShareLink.mockResolvedValue({ success: false, errors: { form: ["Share link not found."] } });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /revoke/i }));
    expect(await screen.findByText("Share link not found.")).toBeInTheDocument();
    expect(screen.getByText("Mum & Dad")).toBeInTheDocument();
  });

  it("rotates a link and swaps in the fresh token", async () => {
    rotateShareLink.mockResolvedValue({ success: true, link: link({ token: "tok-9" }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(rotateShareLink).toHaveBeenCalledWith("t", "l1");
    expect(await screen.findByText(/tok-9/)).toBeInTheDocument();
  });

  it("saves dial edits through updateShareLink", async () => {
    updateShareLink.mockResolvedValue({ success: true, link: link({ includeDailyPlans: false }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByLabelText("Daily plans"));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateShareLink).toHaveBeenCalledWith("t", "l1", {
      label: "Mum & Dad",
      includeAccommodation: true,
      includeTransport: true,
      includeDailyPlans: false,
    });
    expect(await screen.findByText("Route & dates · Accommodation · Transport")).toBeInTheDocument();
  });
});
