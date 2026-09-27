import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalEntryView } from "./journal-entry-view";

const UPDATED = new Date("2026-01-05T20:00:00Z");

describe("JournalEntryView — Playground kit shape (Task 13)", () => {
  it("attributes the entry with a kit Avatar (initials) and the author's name", () => {
    const { container } = render(
      <JournalEntryView
        body="Arctic Circle!"
        updatedAt={UPDATED}
        author={{ id: "u1", name: "Cam Williams", image: null }}
      />,
    );
    expect(screen.getByText("Arctic Circle!")).toBeInTheDocument();
    expect(screen.getByText("CW")).toBeInTheDocument();
    expect(screen.getByText(/Cam Williams/)).toBeInTheDocument();
    // The time is a real <time> with the ISO timestamp.
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(UPDATED.toISOString());
  });

  it("is a kit Card by default (day page) and unframed inside the journal's day card", () => {
    const { container, rerender } = render(
      <JournalEntryView body="x" updatedAt={UPDATED} author={{ id: "u1", name: "Cam", image: null }} />,
    );
    expect(container.firstElementChild?.className).toMatch(/border-2/);
    rerender(
      <JournalEntryView
        body="x"
        updatedAt={UPDATED}
        author={{ id: "u1", name: "Cam", image: null }}
        framed={false}
      />,
    );
    expect(container.firstElementChild?.className ?? "").not.toMatch(/border-2|shadow-hard/);
  });

  it("falls back to the time alone when there is no author", () => {
    const { container } = render(
      <JournalEntryView body="x" updatedAt={UPDATED} author={null} />,
    );
    expect(container.querySelector("time")).toBeTruthy();
  });

  // Task 2 (one TravellerAvatar everywhere): a Traveller's own Display name
  // — not just their sign-in provider name — must show here too, since this
  // view is the one place a Journal entry's author is attributed.
  it("shows the author's Display name, not just their provider name", () => {
    render(
      <JournalEntryView
        body="x"
        updatedAt={UPDATED}
        author={{ id: "u1", name: "Cameron Williams", image: null, displayName: "Cam" }}
      />,
    );
    expect(screen.getByText(/^Cam ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Cameron Williams/)).not.toBeInTheDocument();
  });

  // Journal page's own reported gap: this view previously only ever rendered
  // the initials fallback — an uploaded Profile photo must now show.
  it("renders the author's uploaded Profile photo, not just initials", async () => {
    render(
      <JournalEntryView
        body="x"
        updatedAt={UPDATED}
        author={{
          id: "u1",
          name: "Cam",
          image: null,
          photoKey: "users/u1/photo.png",
          photoUpdatedAt: new Date("2026-01-01T00:00:00Z"),
        }}
      />,
    );
    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toMatch(/^\/api\/avatars\/u1/);
  });
});
