import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorPanel } from "@/components/ui/error-panel";

describe("ErrorPanel", () => {
  it("shows the title and description it is given", () => {
    render(<ErrorPanel title="Couldn't load your trip" description="Check your connection." />);
    expect(screen.getByText("Couldn't load your trip")).toBeInTheDocument();
    expect(screen.getByText("Check your connection.")).toBeInTheDocument();
  });

  it("renders caller-supplied actions, keeping the handler in the caller", async () => {
    const reset = vi.fn();
    render(
      <ErrorPanel
        title="Couldn't load your trip"
        actions={<button onClick={reset}>Try again</button>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders no action area when the caller supplies none", () => {
    render(<ErrorPanel title="Couldn't load your trip" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the digest so it can be quoted, never the raw message", () => {
    render(<ErrorPanel title="Something went wrong" digest="abc123" />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("interrupts for a genuine error but only announces politely for the rest", () => {
    const { rerender } = render(<ErrorPanel kind="error" title="That didn't load" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<ErrorPanel kind="offline" title="You're offline" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
