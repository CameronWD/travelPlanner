import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "./activity-feed";
import type { ActivityRow } from "./activity-feed";

const BASE_ACTOR = { id: "user-1", name: "Alice", image: null };

const CREATED_ACTIVITY: ActivityRow = {
  id: "act-1",
  verb: "CREATED",
  entityType: "STOP",
  entityLabel: "Rome",
  changes: null,
  createdAt: new Date("2026-06-01T10:00:00Z"),
  actor: BASE_ACTOR,
};

const UPDATED_ACTIVITY: ActivityRow = {
  id: "act-2",
  verb: "UPDATED",
  entityType: "ITEM",
  entityLabel: "Colosseum Tour",
  changes: [
    { field: "title", label: "Title", from: "Tour", to: "Colosseum Tour" },
  ],
  createdAt: new Date("2026-06-02T12:00:00Z"),
  actor: BASE_ACTOR,
};

const NOTED_ACTIVITY: ActivityRow = {
  id: "act-3",
  verb: "NOTED",
  entityType: "NOTE",
  entityLabel: "note",
  changes: { excerpt: "Don't forget the passports!" },
  createdAt: new Date("2026-06-03T09:00:00Z"),
  actor: BASE_ACTOR,
};

describe("ActivityFeed", () => {
  it("renders an empty state when activities is empty", () => {
    render(<ActivityFeed activities={[]} />);
    // EmptyState renders the title in an h3
    expect(screen.getByRole("heading", { name: /no activity yet/i })).toBeInTheDocument();
    // Description is present
    expect(screen.getByText(/changes to your trip/i)).toBeInTheDocument();
  });

  it("renders the CREATED headline text", () => {
    render(<ActivityFeed activities={[CREATED_ACTIVITY]} />);
    // headline: "added the Rome stop"
    expect(screen.getByText(/added the Rome stop/i)).toBeInTheDocument();
  });

  it("renders the actor name for a CREATED activity", () => {
    render(<ActivityFeed activities={[CREATED_ACTIVITY]} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders UPDATED headline and from → to change line", () => {
    render(<ActivityFeed activities={[UPDATED_ACTIVITY]} />);
    // headline: "updated the Colosseum Tour item"
    expect(screen.getByText(/updated the Colosseum Tour item/i)).toBeInTheDocument();
    // change line contains label and arrow
    expect(screen.getByText("Title:")).toBeInTheDocument();
    // The change li contains "Tour → Colosseum Tour" (inner change list item)
    const changeLis = screen.getAllByText((_, el) =>
      el?.tagName === "LI" && /Tour\s*→\s*Colosseum Tour/.test(el.textContent ?? ""),
    );
    // At least one matching element should exist (may include parent li)
    expect(changeLis.length).toBeGreaterThan(0);
  });

  it("renders both activities when multiple are provided", () => {
    render(<ActivityFeed activities={[CREATED_ACTIVITY, UPDATED_ACTIVITY]} />);
    expect(screen.getByText(/added the Rome stop/i)).toBeInTheDocument();
    expect(screen.getByText(/updated the Colosseum Tour item/i)).toBeInTheDocument();
  });

  it("renders the NOTED headline and the note excerpt in quotes", () => {
    render(<ActivityFeed activities={[NOTED_ACTIVITY]} />);
    // Headline: "Alice left a note"
    expect(screen.getByText(/left a note/i)).toBeInTheDocument();
    // Excerpt rendered in quotes
    expect(screen.getByText(/Don't forget the passports!/i)).toBeInTheDocument();
  });

  it("renders the <time> element with a dateTime attribute and a title for the absolute timestamp", () => {
    render(<ActivityFeed activities={[CREATED_ACTIVITY]} />);
    const timeEl = document.querySelector("time");
    expect(timeEl).toBeTruthy();
    // dateTime should be the ISO string
    expect(timeEl?.getAttribute("dateTime")).toBe(
      CREATED_ACTIVITY.createdAt.toISOString(),
    );
    // title should be the locale string (non-empty)
    expect(timeEl?.getAttribute("title")).toBeTruthy();
  });

  it("renders a summary payload as '{actor} {summary}', not the generic headline", () => {
    render(
      <ActivityFeed
        activities={[
          {
            id: "a1",
            verb: "UPDATED",
            entityType: "STOP",
            entityLabel: "Rome",
            changes: { summary: "firmed up 4 stops · 3 Jul 2026 – 18 Jul 2026" },
            createdAt: new Date("2026-06-25T10:00:00Z"),
            actor: { id: "u1", name: "Cam", image: null },
          },
        ]}
      />,
    );
    expect(screen.getByText(/firmed up 4 stops/)).toBeInTheDocument();
    expect(screen.queryByText(/updated the/)).not.toBeInTheDocument();
  });
});
