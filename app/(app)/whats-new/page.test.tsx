import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/release-notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/release-notes")>();
  return {
    ...actual,
    RELEASE_NOTES: [
      { publishedAt: "2026-09-21T12:00:00Z", text: "Newer same day" },
      { publishedAt: "2026-09-21T10:00:00Z", text: "Older same day" },
      { publishedAt: "2026-09-10T10:00:00Z", text: "Earlier release" },
    ],
  };
});

import WhatsNewPage from "./page";
import { RELEASE_NOTES } from "@/lib/release-notes";

describe("/whats-new", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists every Release note", async () => {
    render(await WhatsNewPage());
    expect(screen.getByText("Newer same day")).toBeTruthy();
    expect(screen.getByText("Older same day")).toBeTruthy();
    expect(screen.getByText("Earlier release")).toBeTruthy();
  });

  it("groups a day's notes under one heading", async () => {
    const { container } = render(await WhatsNewPage());
    const headings = Array.from(container.querySelectorAll("h2")).map(
      (h) => h.textContent,
    );
    expect(headings).toHaveLength(2);
  });

  // ── Playground kit restyle (phase 3, Task 18): admin.jsx `WhatsNew` ──

  it("titles the page with the kit display h1", async () => {
    render(await WhatsNewPage());
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("What's new");
    expect(h1.className).toMatch(/\bfont-extrabold\b/);
  });

  it("draws each release as its own kit Card with the date as its heading, newest first", async () => {
    const { container } = render(await WhatsNewPage());
    const cards = Array.from(container.querySelectorAll("[data-slot='release']"));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toMatch(/\bborder-2\b/);
      expect(card.querySelector("h2")).toBeTruthy();
    }
    expect(cards[0].querySelector("h2")?.textContent).toBe("21 September 2026");
    expect(cards[1].querySelector("h2")?.textContent).toBe("10 September 2026");
    // A day's notes stay together inside that day's card.
    expect(cards[0].textContent).toContain("Newer same day");
    expect(cards[0].textContent).toContain("Older same day");
    expect(cards[1].textContent).toContain("Earlier release");
  });

  it("makes only the latest release the coral lead card, the rest white", async () => {
    const { container } = render(await WhatsNewPage());
    const [latest, older] = Array.from(container.querySelectorAll("[data-slot='release']"));
    expect(latest.className).toMatch(/\bbg-coral\b/);
    expect(latest.className).toMatch(/\bshadow-hard-4\b/);
    expect(older.className).toMatch(/\bbg-card\b/);
    expect(older.className).toMatch(/\bshadow-hard-2\b/);
  });

  it("shows the kit empty state when there are no Release notes", async () => {
    const saved = RELEASE_NOTES.splice(0, RELEASE_NOTES.length);
    try {
      render(await WhatsNewPage());
      expect(screen.getByRole("heading", { name: "Nothing yet" })).toBeTruthy();
    } finally {
      RELEASE_NOTES.push(...saved);
    }
  });
});
