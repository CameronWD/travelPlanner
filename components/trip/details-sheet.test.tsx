import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import { DetailsSheet } from "./details-sheet";
import type { DetailsView } from "@/lib/details-view";
import { directionsFromHereUrl } from "@/lib/map/maps";

const full: DetailsView = {
  title: "Paris → Munich",
  subtitle: "Train",
  times: [
    { label: "Departs", value: "5 Dec 09:30 CET" },
    { label: "Arrives", value: "5 Dec 16:10 CET" },
  ],
  files: [
    {
      id: "f1", filename: "ticket.pdf", title: "Boarding pass", mime: "application/pdf", size: 10,
      url: "/api/attachments/f1", uploadedById: "u1", createdAt: new Date("2026-11-01T00:00:00Z"),
    },
  ],
  reference: "ABC123",
  referenceLabel: "Reference",
  address: "Marienplatz 1",
  place: { lat: 48.1, lng: 11.5 },
  notes: "Coach 7",
  link: "https://example.com/booking",
  tryList: [
    { id: "e1", text: "Pretzel", tried: true },
    { id: "e2", text: "Weisswurst", tried: false },
  ],
  openingHours: "Open 09:00–18:00",
  cost: { label: "€120.00", paid: true },
};

const bare: DetailsView = {
  title: "Tower", subtitle: null, times: [], files: [], reference: null, referenceLabel: "Reference", address: null, place: null,
  notes: null, link: null, tryList: null, openingHours: null, cost: null,
};

function renderSheet(view: DetailsView, onEdit = vi.fn(), canEdit?: boolean) {
  render(<DetailsSheet view={view} open onOpenChange={() => {}} onEdit={onEdit} mode="DRIVE" canEdit={canEdit} />);
  return screen.getByRole("dialog");
}

describe("DetailsSheet", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("renders every row in order, then Edit", () => {
    const dialog = renderSheet(full);
    const rows = [...dialog.querySelectorAll("[data-row]")].map((el) => el.getAttribute("data-row"));
    expect(rows).toEqual([
      "title", "times", "files", "reference", "address", "notes", "link", "try-list", "opening-hours", "cost", "edit",
    ]);
    expect(within(dialog).getByRole("heading", { name: "Paris → Munich" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Train");
    expect(dialog).toHaveTextContent("Departs5 Dec 09:30 CET");
    expect(dialog).toHaveTextContent("Arrives5 Dec 16:10 CET");
    expect(dialog).toHaveTextContent("Coach 7");
    expect(dialog).toHaveTextContent("Open 09:00–18:00");
    expect(dialog).toHaveTextContent("€120.00");
    expect(dialog).toHaveTextContent("Paid");
    expect(within(dialog).getByText("Pretzel")).toBeInTheDocument();
    expect(within(dialog).getByText("Weisswurst")).toBeInTheDocument();
  });

  it("each file is a full-width row linking to the file", () => {
    const dialog = renderSheet(full);
    const link = within(dialog).getByRole("link", { name: /Boarding pass/ });
    expect(link).toHaveAttribute("href", "/api/attachments/f1");
    expect(link).not.toHaveAttribute("target");
    expect(link.className).toContain("w-full");
    expect(link.className).toContain("min-h-11");
  });

  it("the address opens in maps, and Directions start from here in the Local travel mode", () => {
    const dialog = renderSheet(full);
    expect(within(dialog).getByRole("link", { name: "Marienplatz 1" }).getAttribute("href")).toContain("google.com/maps");
    expect(within(dialog).getByRole("link", { name: "Directions" })).toHaveAttribute(
      "href",
      directionsFromHereUrl({ lat: 48.1, lng: 11.5 }, "DRIVE").google,
    );
    expect(within(dialog).getByRole("link", { name: "https://example.com/booking" })).toHaveAttribute(
      "href",
      "https://example.com/booking",
    );
  });

  it("a place with no address is a Directions row with no Address heading", () => {
    const dialog = renderSheet({ ...bare, place: { lat: 48.1, lng: 11.5 } });
    const rows = [...dialog.querySelectorAll("[data-row]")].map((el) => el.getAttribute("data-row"));
    expect(rows).toEqual(["title", "directions", "edit"]);
    expect(dialog).not.toHaveTextContent("Address");
    expect(within(dialog).getByRole("link", { name: "Directions" })).toHaveAttribute(
      "href",
      directionsFromHereUrl({ lat: 48.1, lng: 11.5 }, "DRIVE").google,
    );
  });

  it("every link out of the app opens with noopener noreferrer", () => {
    const dialog = renderSheet(full);
    const external = within(dialog).getAllByRole("link").filter((a) => a.getAttribute("target") === "_blank");
    expect(external).toHaveLength(3);
    for (const a of external) expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("each Try list entry says whether it was tried", () => {
    const dialog = renderSheet(full);
    expect(within(dialog).getByText("Pretzel").closest("li")).toHaveTextContent("Pretzel(tried)");
    expect(within(dialog).getByText("Weisswurst").closest("li")).toHaveTextContent("Weisswurst(not tried yet)");
  });

  it("an unpaid cost says so", () => {
    const dialog = renderSheet({ ...full, cost: { label: "€120.00", paid: false } });
    expect(dialog).toHaveTextContent("Not paid yet");
  });

  it("a bare thing is its title and Edit, nothing else", () => {
    const dialog = renderSheet(bare);
    const rows = [...dialog.querySelectorAll("[data-row]")].map((el) => el.getAttribute("data-row"));
    expect(rows).toEqual(["title", "edit"]);
    expect(dialog.textContent?.replace("Close", "")).toBe("TowerEdit");
  });

  it("the copy button writes the reference to the clipboard", async () => {
    const dialog = renderSheet(full);
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy reference" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABC123");
    expect(await within(dialog).findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Reference copied");
  });

  it("labels an Accommodation's number Confirmation and a Transport's or Item's Reference", () => {
    expect(renderSheet(full).textContent).toContain("Reference");
    cleanup();
    const dialog = renderSheet({ ...full, referenceLabel: "Confirmation" });
    expect(dialog.querySelector('[data-row="reference"]')?.textContent).toContain("Confirmation");
    expect(dialog.querySelector('[data-row="reference"]')?.textContent).not.toContain("Reference");
  });

  it("Edit calls onEdit", () => {
    const onEdit = vi.fn();
    const dialog = renderSheet(bare, onEdit);
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("canEdit false leaves Edit out", () => {
    const dialog = renderSheet(bare, vi.fn(), false);
    expect(within(dialog).queryByRole("button", { name: "Edit" })).toBeNull();
    expect([...dialog.querySelectorAll("[data-row]")].map((el) => el.getAttribute("data-row"))).toEqual(["title"]);
  });
});
