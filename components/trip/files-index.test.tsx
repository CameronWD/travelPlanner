import { SOMETHING_WENT_WRONG } from "@/components/ui/action-failure";
import type { Route } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setAttachmentTitle = vi.fn();
const moveAttachment = vi.fn();
vi.mock("@/server/actions/attachments", () => ({
  get setAttachmentTitle() { return setAttachmentTitle; },
  get moveAttachment() { return moveAttachment; },
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), usePathname: () => "/trips/t1/files" }));
vi.mock("@/lib/image-compress", () => ({ compressImage: vi.fn(), oversizeUploadMessage: () => "" }));

import { FilesIndex } from "./files-index";
import type { AttachmentView } from "./attachment-list";

const base = { mime: "application/pdf", size: 1024, url: "/api/attachments/x", uploadedById: "u1", createdAt: new Date("2026-10-01T00:00:00Z") };
const tripFile: AttachmentView = { ...base, id: "f-trip", filename: "trip.pdf", title: null, owner: null };
const itemFile: AttachmentView = { ...base, id: "f-item", targetId: "i1", filename: "ticket.pdf", title: "Colosseum ticket", owner: { label: "Colosseum", href: "/trips/t1/day/2026-12-05" as Route } };
const stopFile: AttachmentView = { ...base, id: "f-stop", filename: "rome.pdf", title: null, owner: { label: "Rome", href: "/trips/t1/plan#open=s1" as Route } };
const moveTargets = [
  { label: "Trip", options: [{ value: "TRIP", label: "Whole trip", target: { type: "TRIP" as const } }] },
  { label: "Stops", options: [{ value: "STOP:s1", label: "Rome", target: { type: "STOP" as const, id: "s1" } }] },
  { label: "Things to do", options: [{ value: "ITEM:i2", label: "Gelato", target: { type: "ITEM" as const, id: "i2" } }] },
];
const photoFile: AttachmentView = { ...itemFile, id: "f-photo", filename: "photo.jpg", title: null, movable: false };
const toAdd = [
  { kind: "TRANSPORT" as const, id: "t1", label: "Rome → Paris", href: "/trips/t1/plan#open=s1" as Route },
  { kind: "ITEM" as const, id: "i9", label: "Louvre", href: "/trips/t1/day/2026-12-06" as Route },
];

beforeEach(() => {
  setAttachmentTitle.mockReset().mockResolvedValue({ success: true });
  moveAttachment.mockReset().mockResolvedValue({ success: true });
  refresh.mockReset();
});

function renderIndex(extra: { toAdd?: typeof toAdd } = {}) {
  return render(
    <FilesIndex
      tripId="t1"
      tripAttachments={[tripFile]}
      toAdd={extra.toAdd ?? []}
      sections={[
        { type: "ITEM", label: "Things to do", attachments: [itemFile, photoFile] },
        { type: "STOP", label: "Stops", attachments: [stopFile] },
      ]}
      moveTargets={moveTargets}
    />,
  );
}

describe("FilesIndex", () => {
  it("renames a file through the dialog; the action's revalidation redraws (spec 2026-10-06 §J)", async () => {
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Rename rome.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename file" });
    const field = within(dialog).getByLabelText("Title");
    await userEvent.clear(field);
    await userEvent.type(field, "Rome hotel voucher");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(setAttachmentTitle).toHaveBeenCalledWith("f-stop", "Rome hotel voucher");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers Move on every file except an Item photo", () => {
    renderIndex();
    expect(screen.getByRole("button", { name: "Move trip.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Colosseum ticket" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move rome.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move photo.jpg" })).toBeNull();
  });

  it("Move calls moveAttachment with the chosen target", async () => {
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Move trip.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Move file" });
    const select = within(dialog).getByLabelText("Move to") as HTMLSelectElement;
    expect(within(select).getByRole("group", { name: "Stops" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "ITEM:i2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(moveAttachment).toHaveBeenCalledWith("f-trip", { type: "ITEM", id: "i2" });
  });

  it("shows the Move refusal inside the dialog and keeps it open", async () => {
    moveAttachment.mockResolvedValue({ success: false, errors: { _: ["Remove it as the photo first."] } });
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Move trip.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Move file" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Move to"), "TRIP");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(await within(dialog).findByText("Remove it as the photo first.")).toBeInTheDocument();
  });

  it("shows SOMETHING_WENT_WRONG inside the dialog when the Move action throws", async () => {
    moveAttachment.mockRejectedValue(new Error("not found"));
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Move trip.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Move file" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Move to"), "TRIP");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(await within(dialog).findByText(SOMETHING_WENT_WRONG)).toBeInTheDocument();
  });

  it("lists Booking confirmations to add above the other groups, one link each", () => {
    renderIndex({ toAdd });
    const heading = screen.getByRole("heading", { name: "Booking confirmations to add" });
    expect(screen.getByRole("link", { name: "Rome → Paris" })).toHaveAttribute("href", "/trips/t1/plan#open=s1");
    expect(screen.getByRole("link", { name: "Louvre" })).toHaveAttribute("href", "/trips/t1/day/2026-12-06");
    const stopsHeading = screen.getByRole("heading", { name: "Stops" });
    expect(heading.compareDocumentPosition(stopsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no confirmations heading when there is nothing to add", () => {
    renderIndex();
    expect(screen.queryByRole("heading", { name: "Booking confirmations to add" })).toBeNull();
  });

  it("shows the action's error inside the dialog and keeps it open", async () => {
    setAttachmentTitle.mockResolvedValue({ success: false, errors: { _: ["Title must be 120 characters or fewer."] } });
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Rename trip.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename file" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Title must be 120 characters or fewer.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
