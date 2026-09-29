import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInPanelProvider, LandingActions } from "./sign-in-panel";

function setup() {
  return render(
    <SignInPanelProvider controls={<button type="button">Continue with Google</button>}>
      <LandingActions size="lg" />
    </SignInPanelProvider>,
  );
}

const DENIED = "Your Google account isn't on the list. We've recorded the attempt for the admin — there's nothing else to do here. This page can't tell you where a request stands, and not every request is granted; if you're expecting access, ask whoever invited you.";

describe("Sign in panel (spec collage §1.1)", () => {
  it("renders Sign in and Request access buttons and the Legal line; no dialog until clicked", () => {
    setup();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request access" })).toBeInTheDocument();
    expect(screen.getByText("Teepee is invite-only")).toBeInTheDocument();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).queryByText("Teepee is invite-only")).not.toBeInTheDocument();
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(legal).getByRole("link", { name: "Privacy" }).className).toContain("tap-target");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sign up|log ?in/i);
  });
  it("Sign in opens 'Come on in' with the invite line and the passed controls, in light mode", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const dialog = screen.getByRole("dialog", { name: "Come on in" });
    expect(within(dialog).getByText("Teepee is invite-only — sign in with the Google account you were invited with.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(dialog.closest('[data-theme="light"]')).not.toBeNull();
  });
  it("Request access opens 'Ask to join' with the request line; Close closes it", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Request access" }));
    const dialog = screen.getByRole("dialog", { name: "Ask to join" });
    expect(within(dialog).getByText("Teepee is invite-only. Sign in with Google and we'll pass your name to the admin — there's nothing else to fill in.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("initialMode 'denied' opens the panel on load with the neutral denied copy and the controls", () => {
    render(
      <SignInPanelProvider initialMode="denied" controls={<button type="button">Continue with Google</button>}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Teepee is invite-only." });
    expect(within(dialog).getByText(DENIED)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
  it("closing the denied panel strips only ?error from the URL, so a refresh does not reopen it", async () => {
    window.history.replaceState(null, "", "/?error=AccessDenied&callbackUrl=%2Ftrips");
    render(
      <SignInPanelProvider initialMode="denied" controls={<span />}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?callbackUrl=%2Ftrips");
  });
  it("never imports the server-only controls into the client file (Review Focus 1)", () => {
    const src = readFileSync(join(__dirname, "sign-in-panel.tsx"), "utf8");
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).not.toMatch(/sign-in-controls|process\.env/);
  });
  it("restores focus to the opener when the panel closes (Radix triggerRef is null with no DialogTrigger)", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Request access" });
    trigger.focus();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Ask to join" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
