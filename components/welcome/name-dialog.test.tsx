import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/profile", () => ({
  setDisplayName: vi.fn(async () => ({ success: true })),
}));

import { setDisplayName } from "@/server/actions/profile";
import { NameDialog, NAME_DIALOG_COPY } from "./name-dialog";

const mockSetDisplayName = setDisplayName as unknown as ReturnType<typeof vi.fn>;

describe("NameDialog (spec 2026-10-04 §E)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens on mount with the question, one empty Display name field and Save — and no close button", () => {
    render(<NameDialog />);
    const dialog = screen.getByRole("dialog", { name: "What should I call you?" });
    expect(dialog).toHaveTextContent(NAME_DIALOG_COPY.body);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.maxLength).toBe(60);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Escape does nothing", async () => {
    render(<NameDialog />);
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mockSetDisplayName).not.toHaveBeenCalled();
  });

  it("a tap outside the sheet does nothing", async () => {
    render(<NameDialog />);
    // Radix attaches its outside-pointerdown listener on a macrotask after mount.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "touch" });
    fireEvent.click(document.body);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refuses a blank or whitespace-only name without calling the server", async () => {
    render(<NameDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(NAME_DIALOG_COPY.blank)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Display name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(NAME_DIALOG_COPY.blank)).toBeInTheDocument();
    expect(mockSetDisplayName).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Save sends the trimmed name and closes once it is stored", async () => {
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "  Xanthia ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockSetDisplayName).toHaveBeenCalledWith("Xanthia");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Enter in the field saves too", async () => {
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "Cam{Enter}");
    expect(mockSetDisplayName).toHaveBeenCalledWith("Cam");
  });

  it("shows the server's validation message and stays open", async () => {
    mockSetDisplayName.mockResolvedValueOnce({
      success: false,
      errors: { displayName: ["Display name must be 60 characters or fewer."] },
    });
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "Cam");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Display name must be 60 characters or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offline (the action throws) keeps it open with the name still typed", async () => {
    mockSetDisplayName.mockRejectedValueOnce(new Error("offline"));
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "Cam");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(NAME_DIALOG_COPY.failed)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Cam");
  });
});
