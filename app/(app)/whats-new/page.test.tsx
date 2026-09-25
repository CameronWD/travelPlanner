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
      // Not a landmark per shipped day: the h2 already gives the structure.
      expect(card.getAttribute("role")).toBeNull();
      expect(card.hasAttribute("aria-labelledby")).toBe(false);
    }
    expect(screen.queryAllByRole("region")).toHaveLength(0);
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

  it("centres the two-column block in the wide shell, matching legal-page (LA-047)", async () => {
    render(await WhatsNewPage());
    const nav = screen.getByRole("navigation", { name: "Releases" });
    const grid = nav.parentElement as HTMLElement;
    expect(grid.className).toContain("lg:justify-center");
    expect(grid.className).not.toContain("lg:justify-start");
    // Same reading-measure token as legal-page.tsx (LA-051), not the old
    // 68ch literal that mismeasured this font by ~40%.
    expect(grid.className).toContain("minmax(0,38rem)");
  });

  // I-3: the title block lives in the same centred grid as the cards, so at
  // ≥1024 the h1 lines up with the release column instead of the shell edge.
  it("puts the page title in the centred grid's first column (I-3)", async () => {
    render(await WhatsNewPage());
    const nav = screen.getByRole("navigation", { name: "Releases" });
    const grid = nav.parentElement as HTMLElement;
    const titleBlock = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(titleBlock.parentElement).toBe(grid);
    expect(titleBlock.className).toContain("lg:col-start-1");
    expect(nav.className).toContain("lg:col-start-2");
  });

  // M-6: a long release list scrolls inside its sticky column instead of
  // running past the viewport where its lower links can't be reached.
  it("caps the sticky release list to the viewport and lets it scroll (M-6)", async () => {
    render(await WhatsNewPage());
    const nav = screen.getByRole("navigation", { name: "Releases" });
    expect(nav.className).toContain("lg:max-h-[calc(100dvh-6rem)]");
    expect(nav.className).toContain("lg:overflow-y-auto");
  });

  it("shows a sticky release list beside the notes on desktop", async () => {
    render(await WhatsNewPage());
    const nav = screen.getByRole("navigation", { name: "Releases" });
    expect(nav.className).toContain("lg:sticky");
    expect(
      screen.getByRole("link", { name: "21 September 2026" }),
    ).toHaveAttribute("href", "#release-2026-09-21");
    expect(
      screen.getByRole("link", { name: "10 September 2026" }),
    ).toHaveAttribute("href", "#release-2026-09-10");
  });

  it("gives each release Card a scroll-anchored id matching the nav link", async () => {
    const { container } = render(await WhatsNewPage());
    const cards = Array.from(container.querySelectorAll("[data-slot='release']"));
    expect(cards[0].id).toBe("release-2026-09-21");
    expect(cards[0].className).toContain("scroll-mt-20");
    expect(cards[1].id).toBe("release-2026-09-10");
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
