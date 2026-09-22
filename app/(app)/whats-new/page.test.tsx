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
});
