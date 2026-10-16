import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailSignInForm } from "./email-sign-in";

const magicLinkMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { magicLink: magicLinkMock } },
}));

const SENT = "If that address is on the list, a link is on its way. Check your inbox.";

beforeEach(() => {
  magicLinkMock.mockReset();
});

async function submit(email = "cam@example.com") {
  await userEvent.type(screen.getByRole("textbox", { name: "Email" }), email);
  await userEvent.click(screen.getByRole("button", { name: "Send me a link" }));
}

describe("EmailSignInForm (spec 2026-10-01 §B3)", () => {
  it("is a real form with a required email input and a submit button", () => {
    const { container } = render(<EmailSignInForm callbackUrl="/trips" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(container.querySelector("form")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send me a link" })).toHaveAttribute("type", "submit");
  });

  it("asks Better Auth for a magic link, carrying the callbackURL and an errorCallbackURL back to the Landing", async () => {
    magicLinkMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<EmailSignInForm callbackUrl="/trips/new?fromShare=tok" />);
    await submit("cam@example.com");
    expect(magicLinkMock).toHaveBeenCalledWith({
      email: "cam@example.com",
      callbackURL: "/trips/new?fromShare=tok",
      errorCallbackURL: "/",
    });
  });

  it("shows the neutral sent copy after a successful send", async () => {
    magicLinkMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the SAME neutral copy when the address was refused (never an oracle of who is on the list)", async () => {
    magicLinkMock.mockResolvedValue({ data: null, error: { code: "AccessDenied", message: "AccessDenied" } });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit("stranger@example.com");
    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/not on the list|isn't on the list|refused|denied/i);
  });

  it("'Use a different address' returns to an empty field", async () => {
    magicLinkMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: "Use a different address" }));
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("");
  });

  it("'Use a different address' puts focus back in the email field — but the field never grabs focus on first mount", async () => {
    magicLinkMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<EmailSignInForm callbackUrl="/trips" />);
    expect(screen.getByRole("textbox", { name: "Email" })).not.toHaveFocus();
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: "Use a different address" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus());
  });

  it("a configuration failure (a real error other than AccessDenied) shows the generic failure line and keeps the address", async () => {
    magicLinkMock.mockResolvedValue({ data: null, error: { code: "INTERNAL_SERVER_ERROR", message: "boom" } });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    expect(await screen.findByText("Couldn't send the link just now. Try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("cam@example.com");
    expect(screen.queryByText(SENT)).toBeNull();
  });

  it("a thrown signIn.magicLink shows the generic failure line", async () => {
    magicLinkMock.mockRejectedValue(new Error("Failed to fetch"));
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    expect(await screen.findByText("Couldn't send the link just now. Try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("cam@example.com");
    expect(screen.queryByText(SENT)).toBeNull();
  });

  it("disables the button while sending so a double tap sends one link", async () => {
    let resolve!: (v: unknown) => void;
    magicLinkMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    await waitFor(() => expect(screen.getByRole("button", { name: /Sending/ })).toBeDisabled());
    resolve({ data: { status: true }, error: null });
    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(magicLinkMock).toHaveBeenCalledTimes(1);
  });
});
