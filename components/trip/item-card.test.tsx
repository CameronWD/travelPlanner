import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mock the heavy server-side dependency chain that item-card pulls in via
// cost-editor → server/actions/costs → lib/guards → lib/auth → next-auth.
// Only the module that cannot be resolved in jsdom (next-auth) is the blocker;
// guard it at the closest call-site so the component tree can render cleanly.
// ---------------------------------------------------------------------------

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn(),
  updateCost: vi.fn(),
  deleteCost: vi.fn(),
}));

vi.mock("@/server/actions/notes", () => ({
  createNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("@/server/actions/votes", () => ({
  upsertVote: vi.fn(),
  deleteVote: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

// Import AFTER mocks are registered (vitest hoists vi.mock, so the order is safe).
import { ItemCard, type ItemCardItem } from "./item-card";

// ---------------------------------------------------------------------------
// Minimal item fixture
// ---------------------------------------------------------------------------

const baseItem: ItemCardItem = {
  id: "item-1",
  title: "Eiffel Tower",
  category: "SIGHTSEEING",
};

// ---------------------------------------------------------------------------
// FIX 3 — AttachmentPopover guard symmetry with NoteThread
// ---------------------------------------------------------------------------

describe("ItemCard — AttachmentPopover guard symmetry", () => {
  it("renders AttachmentPopover in wishlist mode when attachments + tripId are provided", () => {
    render(
      <ItemCard
        item={baseItem}
        mode="wishlist"
        tripId="trip-1"
        attachments={[]}
      />,
    );
    // AttachmentPopover renders a trigger button with aria-label containing "Attachment"
    const btn = screen.queryByRole("button", { name: /attachment/i });
    expect(btn).not.toBeNull();
  });

  it("does NOT render AttachmentPopover in scheduled mode (guard symmetry)", () => {
    render(
      <ItemCard
        item={baseItem}
        mode="scheduled"
        tripId="trip-1"
        attachments={[]}
      />,
    );
    const btn = screen.queryByRole("button", { name: /attachment/i });
    expect(btn).toBeNull();
  });

  it("does NOT render AttachmentPopover when attachments is undefined", () => {
    render(
      <ItemCard
        item={baseItem}
        mode="wishlist"
        tripId="trip-1"
        // attachments intentionally absent
      />,
    );
    const btn = screen.queryByRole("button", { name: /attachment/i });
    expect(btn).toBeNull();
  });

  it("does NOT render AttachmentPopover when tripId is absent", () => {
    render(
      <ItemCard
        item={baseItem}
        mode="wishlist"
        attachments={[]}
        // tripId intentionally absent
      />,
    );
    const btn = screen.queryByRole("button", { name: /attachment/i });
    expect(btn).toBeNull();
  });
});
