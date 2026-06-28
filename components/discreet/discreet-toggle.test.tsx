import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { DiscreetToggle } from "@/components/discreet/discreet-toggle";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("DiscreetToggle", () => {
  beforeEach(() => {
    refresh.mockReset();
    document.cookie = "";
  });
  it("turns discreet mode on (sets cookie + refreshes)", () => {
    render(<DiscreetToggle discreet={false} label="Workspace" />);
    fireEvent.click(screen.getByRole("button", { name: /discreet mode/i }));
    expect(document.cookie).toContain("teepee-discreet=1");
    expect(refresh).toHaveBeenCalled();
  });
  it("saves a custom label on blur", () => {
    render(<DiscreetToggle discreet={true} label="Workspace" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Q3 Tracker" } });
    fireEvent.blur(input);
    expect(document.cookie).toContain("teepee-discreet-label=Q3%20Tracker");
    expect(refresh).toHaveBeenCalled();
  });
});
