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

  // Fix round 1, Finding 1: spec §K — a day shows every Traveller's note
  // AND photo side by side. The Journal page removed its own shared,
  // ungrouped photo strip in favour of attaching each author's photo(s) to
  // their own entry view.
  describe("photos (fix round 1, Finding 1)", () => {
    const PHOTO = {
      id: "p1",
      filename: "aurora.jpg",
      mime: "image/jpeg",
      size: 1,
      url: "/api/attachments/p1",
      uploadedById: "u1",
      createdAt: UPDATED,
    };

    it("renders no photo grid when there are no photos", () => {
      const { container } = render(
        <JournalEntryView body="x" updatedAt={UPDATED} author={{ id: "u1", name: "Cam", image: null }} />,
      );
      expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("renders this author's own photo, alt-texted by filename", () => {
      render(
        <JournalEntryView
          body="x"
          updatedAt={UPDATED}
          author={{ id: "u1", name: "Cam", image: null }}
          photos={[PHOTO]}
        />,
      );
      expect(screen.getByAltText("aurora.jpg")).toBeInTheDocument();
    });

    it("renders every legacy photo for an author who has more than one on the same day", () => {
      render(
        <JournalEntryView
          body="x"
          updatedAt={UPDATED}
          author={{ id: "u1", name: "Cam", image: null }}
          photos={[PHOTO, { ...PHOTO, id: "p2", filename: "igloo.jpg" }]}
        />,
      );
      expect(screen.getByAltText("aurora.jpg")).toBeInTheDocument();
      expect(screen.getByAltText("igloo.jpg")).toBeInTheDocument();
    });

    it("loads photos lazily, decodes off the main thread and reserves their box (spec 2026-10-06 §S)", () => {
      render(<JournalEntryView body="x" updatedAt={UPDATED} author={{ id: "u1", name: "Cam", image: null }} photos={[PHOTO]} />);
      const img = screen.getByAltText("aurora.jpg");
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("decoding", "async");
      expect(img).toHaveAttribute("width", "280");
      expect(img).toHaveAttribute("height", "140");
    });

    it("renders a photo with no note (empty body) without an empty paragraph", () => {
      const { container } = render(
        <JournalEntryView
          body=""
          updatedAt={UPDATED}
          author={{ id: "u1", name: "Cam", image: null }}
          photos={[PHOTO]}
        />,
      );
      expect(container.querySelector("p")).toBeNull();
      expect(screen.getByAltText("aurora.jpg")).toBeInTheDocument();
    });
  });
});
