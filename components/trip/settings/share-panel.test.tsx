import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const createShareLink = vi.fn().mockResolvedValue({ success: true, token: "new-tok" });
const revokeShareLink = vi.fn().mockResolvedValue({ success: true });
const rotateShareLink = vi.fn().mockResolvedValue({ success: true, token: "rot" });
vi.mock("@/server/actions/share", () => ({
  get createShareLink() { return createShareLink; },
  get revokeShareLink() { return revokeShareLink; },
  get rotateShareLink() { return rotateShareLink; },
}));

// Mock navigator.clipboard (jsdom doesn't implement it)
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
});

import { SharePanel } from "./share-panel";

describe("SharePanel toggle", () => {
  beforeEach(() => {
    createShareLink.mockClear();
    revokeShareLink.mockClear();
  });

  it("switch is off with no token and creates a link when turned on", async () => {
    render(<SharePanel tripId="t" initialToken={null} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(createShareLink).toHaveBeenCalled();
  });

  it("switch is on with a token and revokes when turned off", async () => {
    render(<SharePanel tripId="t" initialToken={"tok"} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    expect(revokeShareLink).toHaveBeenCalled();
  });
});
