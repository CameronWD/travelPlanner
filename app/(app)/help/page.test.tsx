import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId }: { tripId?: string }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} />
  ),
}));

import HelpPage, { metadata } from "./page";

describe("global /help page", () => {
  it("has a title", () => {
    expect(metadata.title).toBeTruthy();
  });

  it("renders the guide with no tripId, so links degrade to text", () => {
    render(<HelpPage />);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("");
  });

  it("renders a page heading", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
