import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: vi.fn() };
});

import { toast } from "@/components/ui/use-toast";
import { ShareLinksPanel } from "./share-links-panel";

const link = (over: Partial<ShareLinkView> = {}): ShareLinkView => ({
  id: "l1",
  token: "tok-1",
  label: "Mum & Dad",
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  includeJournal: false,
  showTravellers: false,
  includeContacts: false,
  createdAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  createShareLink.mockReset();
  updateShareLink.mockReset();
  rotateShareLink.mockReset();
  revokeShareLink.mockReset();
  vi.mocked(toast).mockReset();
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

  it("creates a link with the typed label and dial choices, all dials defaulting on except Journal", async () => {
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
      includeJournal: false,
      showTravellers: false,
      includeContacts: false,
    });
    expect(await screen.findByText("Nana")).toBeInTheDocument();
  });

  it("turns the Journal switch on when creating and shows its helper text", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", includeJournal: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    expect(screen.getByText("Each day's notes and photos, by first name")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(screen.getByRole("switch", { name: /include journal/i }));
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createShareLink).toHaveBeenCalledWith("t", {
      label: "Nana",
      includeAccommodation: true,
      includeTransport: true,
      includeDailyPlans: true,
      includeJournal: true,
      showTravellers: false,
      includeContacts: false,
    });
  });

  it("offers a 'Show who's going' switch, off by default, with helper copy", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", showTravellers: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    const sw = screen.getByRole("switch", { name: /show who's going/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Names and photos of everyone on the trip")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(sw);
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(createShareLink).toHaveBeenCalledWith("t", expect.objectContaining({ showTravellers: true }));
  });

  it("offers a Contact details switch, off by default, disabled until Show who's going is on", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", showTravellers: true, includeContacts: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    const contacts = screen.getByRole("switch", { name: /contact details/i });
    expect(contacts).toHaveAttribute("aria-checked", "false");
    expect(contacts).toBeDisabled();
    expect(screen.getByText('Each traveller\'s phone numbers under their name, only with "Show who\'s going" on.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    expect(contacts).toBeEnabled();
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(contacts);
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(createShareLink).toHaveBeenCalledWith("t", expect.objectContaining({ showTravellers: true, includeContacts: true }));
  });

  it("saves an includeContacts edit through updateShareLink", async () => {
    updateShareLink.mockResolvedValue({ success: true, link: link({ showTravellers: true, includeContacts: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    await userEvent.click(screen.getByRole("switch", { name: /contact details/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateShareLink).toHaveBeenCalledWith("t", "l1", expect.objectContaining({ showTravellers: true, includeContacts: true }));
  });

  it("saves a showTravellers edit through updateShareLink", async () => {
    updateShareLink.mockResolvedValue({ success: true, link: link({ showTravellers: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateShareLink).toHaveBeenCalledWith("t", "l1", expect.objectContaining({ showTravellers: true }));
  });

  it("shows a destructive toast and re-enables Save when updateShareLink rejects", async () => {
    updateShareLink.mockRejectedValueOnce(new Error("network"));
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Couldn't save that. Nothing changed. Try again.",
      });
    });
    // Nothing was changed: the edit form is still open, the row's caption is
    // unchanged, and Save is no longer stuck disabled/loading.
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
    expect(screen.getByText("Full itinerary")).toBeInTheDocument();
  });

  it("shows a destructive toast and re-enables Create when createShareLink rejects", async () => {
    createShareLink.mockRejectedValueOnce(new Error("network"));
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Couldn't save that. Nothing changed. Try again.",
      });
    });
    // Nothing was changed: the create form is still open with what was typed,
    // and the Create button is no longer stuck disabled/loading.
    expect(screen.getByLabelText(/label/i)).toHaveValue("Nana");
    expect(screen.getByRole("button", { name: /^create$/i })).not.toBeDisabled();
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

  it.each([
    ["revoke", /revoke/i],
    ["regenerate", /regenerate/i],
  ] as const)("shows a destructive toast, keeps the row and re-enables the buttons when %s rejects", async (which, name) => {
    (which === "revoke" ? revokeShareLink : rotateShareLink).mockRejectedValueOnce(new Error("network"));
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Couldn't save that. Nothing changed. Try again.",
      });
    });
    // Nothing changed: the row and its token stay, and neither button is stuck.
    expect(screen.getByText("Mum & Dad")).toBeInTheDocument();
    expect(screen.getByText(/tok-1/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /revoke/i })).not.toBeDisabled());
    expect(screen.getByRole("button", { name: /regenerate/i })).not.toBeDisabled();
  });

  it("LA-015: share link actions wrap on phones", () => {
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    const revoke = screen.getByRole("button", { name: /revoke/i });
    expect(revoke.parentElement!.className).toContain("flex-wrap");
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
      includeJournal: false,
      showTravellers: false,
      includeContacts: false,
    });
    expect(await screen.findByText("Route & dates · Accommodation · Transport")).toBeInTheDocument();
  });

  // LA-051: this card's body copy is prose, not a label — it needs the same
  // reading-measure cap as the rest of Settings, or it runs the full width
  // of the (now two-column) card on a wide screen.
  it("caps its body copy to a reading measure (LA-051)", () => {
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    expect(screen.getByText(/One link per audience/).className).toContain("max-w-reading");
    expect(screen.getByText(/No share links yet/).className).toContain("max-w-reading");
  });
});

describe("ShareLinksPanel failures (spec 2026-10-06 §E)", () => {
  // Deliberately the direct `userEvent.click` API, like every other test in
  // this file, rather than `userEvent.setup()`: setup() unconditionally
  // replaces `navigator.clipboard` with its own stub the first time it's
  // called in a file (@testing-library/user-event's Clipboard.js,
  // attachClipboardStubToView), which would silently throw away the
  // module-scope clipboard mock above and make it impossible to control
  // whether writeText resolves or rejects.
  it("toasts when copying the link fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    render(<ShareLinksPanel tripId="trip-1" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't copy the link." }),
    );
  });

  it("names the connection when a create rejects offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    createShareLink.mockRejectedValueOnce(new Error("offline"));
    render(<ShareLinksPanel tripId="trip-1" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    await userEvent.type(screen.getByLabelText("Label"), "Mum & Dad");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "You're offline. Plan changes need a connection." }),
    );
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
});
