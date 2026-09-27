import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trip/journal-editor", () => ({
  JournalEditor: ({
    initialBody,
    photo,
    framed,
  }: {
    initialBody: string;
    photo: { filename: string } | null;
    framed?: boolean;
  }) => (
    <div data-testid="journal-editor" data-framed={String(framed)} data-photo={photo?.filename ?? ""}>
      {initialBody}
    </div>
  ),
}));

import { TodaysJournal } from "./todays-journal";

const PHOTO = {
  id: "p1",
  filename: "sunset.jpg",
  mime: "image/jpeg",
  size: 10,
  url: "/api/attachments/p1",
  uploadedById: "them",
  createdAt: new Date("2026-06-01T09:00:00Z"),
};

describe("TodaysJournal", () => {
  it("renders the viewer's own editor with their body, photo and hiddenFromShares", () => {
    render(
      <TodaysJournal
        tripId="trip-1"
        date="2026-06-01"
        mine={{ body: "My day", updatedAt: new Date("2026-06-01T10:00:00Z"), hiddenFromShares: true }}
        minePhoto={{ ...PHOTO, id: "mine", filename: "mine.jpg", uploadedById: "me" }}
        others={[]}
      />,
    );

    const editor = screen.getByTestId("journal-editor");
    expect(editor.textContent).toBe("My day");
    expect(editor.getAttribute("data-photo")).toBe("mine.jpg");
    // Embedded inside Today's journal's own Card — not framed again.
    expect(editor.getAttribute("data-framed")).toBe("false");
  });

  it("passes an empty editable body when the viewer has no entry yet", () => {
    render(
      <TodaysJournal tripId="trip-1" date="2026-06-01" mine={null} minePhoto={null} others={[]} />,
    );

    expect(screen.getByTestId("journal-editor").textContent).toBe("");
  });

  it("renders each co-Traveller's note and photo, attributed by display name", () => {
    render(
      <TodaysJournal
        tripId="trip-1"
        date="2026-06-01"
        mine={null}
        minePhoto={null}
        others={[
          { traveller: { id: "them", name: "Alex", image: null }, body: "Their day", photo: PHOTO },
        ]}
      />,
    );

    expect(screen.getByText("Their day")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByAltText("sunset.jpg")).toBeInTheDocument();
  });

  it("renders a co-Traveller with only a photo (no note) without an empty paragraph", () => {
    render(
      <TodaysJournal
        tripId="trip-1"
        date="2026-06-01"
        mine={null}
        minePhoto={null}
        others={[{ traveller: { id: "them", name: "Alex", image: null }, body: "", photo: PHOTO }]}
      />,
    );

    expect(screen.getByAltText("sunset.jpg")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });

  it("renders nothing extra for co-Travellers when there are none", () => {
    render(
      <TodaysJournal tripId="trip-1" date="2026-06-01" mine={null} minePhoto={null} others={[]} />,
    );

    expect(screen.getByTestId("todays-journal")).toBeInTheDocument();
  });

  it("titles the card 'Today's journal'", () => {
    render(
      <TodaysJournal tripId="trip-1" date="2026-06-01" mine={null} minePhoto={null} others={[]} />,
    );

    expect(screen.getByRole("heading", { name: "Today's journal" })).toBeInTheDocument();
  });
});
