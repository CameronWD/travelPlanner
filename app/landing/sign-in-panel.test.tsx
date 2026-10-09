import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
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

const DENIED = "You don't have access yet. I've been told you tried. If someone invited you, ask them to check.";

describe("Sign in panel (spec collage §1.1)", () => {
  afterEach(() => {
    // The "strips only ?error" test below rewrites window.location via
    // history.replaceState and never navigates away; reset it so later
    // tests (in this file or run in the same jsdom environment) see a
    // clean "/" rather than a leftover query string.
    window.history.replaceState(null, "", "/");
  });


  it("renders Sign in and Become a tester buttons and the Legal line; no dialog until clicked", () => {
    setup();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Become a tester" })).toBeInTheDocument();
    expect(screen.getByText("Teepee is in testing")).toBeInTheDocument();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).queryByText("Teepee is in testing")).not.toBeInTheDocument();
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(legal).getByRole("link", { name: "Privacy" }).className).toContain("tap-target");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sign up|log ?in/i);
  });
  it("Sign in opens 'Come on in' with the testing line and the passed controls, in light mode", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const dialog = screen.getByRole("dialog", { name: "Come on in" });
    expect(within(dialog).getByText("Teepee is in testing. Sign in with the account you were invited with.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(dialog.closest('[data-theme="light"]')).not.toBeNull();
  });
  it("Become a tester opens 'Want to test it?' with the request line; Close closes it", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Become a tester" }));
    const dialog = screen.getByRole("dialog", { name: "Want to test it?" });
    expect(within(dialog).getByText("Teepee is in testing, by invitation only. Sign in and I'll get your details. There's nothing else to fill in.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens straight into request mode when asked (from a Share page)", () => {
    render(
      <SignInPanelProvider controls={<div>controls</div>} initialMode="request">
        <LandingActions size="md" />
      </SignInPanelProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Want to test it?")).toBeInTheDocument();
  });

  it("initialMode 'denied' opens the panel on load with the neutral denied copy and the controls", () => {
    render(
      <SignInPanelProvider initialMode="denied" controls={<button type="button">Continue with Google</button>}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Teepee is in testing." });
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
    const trigger = screen.getByRole("button", { name: "Become a tester" });
    trigger.focus();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Want to test it?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("align='center' centres the legal row; the row never wraps in either mode (LANDING.md §2.1)", () => {
    const { unmount } = render(
      <SignInPanelProvider controls={<span />}>
        <LandingActions size="md" align="center" />
      </SignInPanelProvider>,
    );
    const centred = screen.getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(centred.className).toContain("justify-center");
    expect(centred.className).toContain("whitespace-nowrap");
    expect(centred.className).not.toContain("flex-wrap");
    unmount();
    setup();
    const start = screen.getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(start.className).not.toContain("justify-center");
    expect(start.className).toContain("whitespace-nowrap");
    expect(start.className).not.toContain("flex-wrap");
  });

  it("never says invite-only as a product statement (spec 2026-10-01 §G)", async () => {
    setup();
    expect(document.body.textContent).not.toMatch(/invite-only/i);
    await userEvent.click(screen.getByRole("button", { name: "Become a tester" }));
    expect(document.body.textContent).not.toMatch(/invite-only/i);
  });

  it("initialMode 'link-expired' opens with the expired-link copy and the controls (spec 2026-10-01 §B3)", () => {
    render(
      <SignInPanelProvider initialMode="link-expired" controls={<button type="button">Continue with Google</button>}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "That link didn't work" });
    expect(within(dialog).getByText("Sign-in links work once and expire after a day. Ask for a new one below.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
});
