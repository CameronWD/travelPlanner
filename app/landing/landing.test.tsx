import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Landing } from "./landing";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("Landing", () => {
  it("leads with the kit's hero heading", () => {
    render(<Landing />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Plan it with your people/ }),
    ).toBeInTheDocument();
  });

  it("links 'Start a trip' to sign-in", () => {
    render(<Landing />);
    expect(screen.getByRole("link", { name: "Start a trip" })).toHaveAttribute("href", "/signin");
  });

  it("signs in from the 'Come on in' card and says access is by invitation", () => {
    render(<Landing />);
    const card = screen.getByRole("region", { name: "Come on in" });
    expect(within(card).getByText(/Teepee is invite-only/)).toBeInTheDocument();
  });

  it("has no invite form and no email field", () => {
    const { container } = render(<Landing />);
    expect(screen.queryByRole("form", { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByText(/^Invite/)).not.toBeInTheDocument();
  });

  it("forces light mode on its root", () => {
    const { container } = render(<Landing />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toContain("light");
    // The dark palette is keyed on `.dark` on <html>; the landing wins only
    // because globals.css re-declares the light tokens under [data-theme="light"].
    const css = readFileSync(join(__dirname, "..", "globals.css"), "utf8");
    expect(css).toMatch(/\[data-theme="light"\],\s*:root\s*\{\s*--background: 40 100% 98%;/);
  });

  it("uses the accommodation heading, never hotel/stay", () => {
    const { container } = render(<Landing />);
    expect(screen.getByText("Where you're staying")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bhotel\b|\bstay\b/i);
  });

  it("shows the access-denied copy in place of the invite line when asked", () => {
    render(<Landing accessDenied />);
    expect(screen.getByText(/recorded the attempt for the admin/)).toBeInTheDocument();
    expect(screen.getAllByText(/invite-only/i)).toHaveLength(1);
  });
});
