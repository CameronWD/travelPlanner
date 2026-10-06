import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setAttachmentTitle = vi.fn();
const linkAttachmentToItem = vi.fn();
vi.mock("@/server/actions/attachments", () => ({
  get setAttachmentTitle() { return setAttachmentTitle; },
  get linkAttachmentToItem() { return linkAttachmentToItem; },
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
const itemFile: AttachmentView = { ...base, id: "f-item", targetId: "i1", filename: "ticket.pdf", title: "Colosseum ticket", owner: { label: "Colosseum", href: "/trips/t1/day/2026-12-05" } };
const stopFile: AttachmentView = { ...base, id: "f-stop", filename: "rome.pdf", title: null, owner: { label: "Rome", href: "/trips/t1/plan#open=s1" } };
const linkTargets = [
  { stopName: "Rome", items: [{ id: "i1", title: "Colosseum" }, { id: "i2", title: "Gelato" }] },
  { stopName: "Wishlist", items: [{ id: "i3", title: "Someday" }] },
];

beforeEach(() => {
  setAttachmentTitle.mockReset().mockResolvedValue({ success: true });
  linkAttachmentToItem.mockReset().mockResolvedValue({ success: true });
  refresh.mockReset();
});

function renderIndex() {
  return render(
    <FilesIndex
      tripId="t1"
      tripAttachments={[tripFile]}
      sections={[
        { type: "ITEM", label: "Things to do", attachments: [itemFile] },
        { type: "STOP", label: "Stops", attachments: [stopFile] },
      ]}
      linkTargets={linkTargets}
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

  it("offers Link to… on Trip-level and Item files only, listing Items by Stop plus Trip-level", async () => {
    renderIndex();
    expect(screen.getByRole("button", { name: "Link trip.pdf to an Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Colosseum ticket to an Item" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link rome.pdf to an Item" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Link trip.pdf to an Item" }));
    const dialog = await screen.findByRole("dialog", { name: "Link to an Item" });
    const select = within(dialog).getByLabelText("Item") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(within(select).getByRole("group", { name: "Rome" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Trip-level (not linked)" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "i2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(linkAttachmentToItem).toHaveBeenCalledWith("f-trip", "i2");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("choosing Trip-level unlinks", async () => {
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Link Colosseum ticket to an Item" }));
    const dialog = await screen.findByRole("dialog", { name: "Link to an Item" });
    const select = within(dialog).getByLabelText("Item") as HTMLSelectElement;
    expect(select.value).toBe("i1");
    await userEvent.selectOptions(select, "");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(linkAttachmentToItem).toHaveBeenCalledWith("f-item", null);
  });

  it("shows the action's error inside the dialog and keeps it open", async () => {
    setAttachmentTitle.mockResolvedValue({ success: false, error: "Title must be 120 characters or fewer." });
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Rename trip.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename file" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Title must be 120 characters or fewer.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
