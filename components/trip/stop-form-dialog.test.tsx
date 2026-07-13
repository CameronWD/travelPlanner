import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/stops", () => ({
  createStop: vi.fn().mockResolvedValue({ success: true }),
  updateStop: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
import { createStop } from "@/server/actions/stops";

import { StopFormDialog } from "./stop-form-dialog";

const baseProps = {
  tripId: "trip-1",
  open: true,
  onOpenChange: vi.fn(),
};

describe("StopFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submitting with empty name calls createStop with name '' (no client-side guard — validation is server-side)", async () => {
    // The component has no client-side empty-name guard: it passes the raw value
    // to the server action and relies on server validation to reject it.
    // This test documents and pins that behaviour.
    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    // Submit immediately with the name field empty
    await user.click(screen.getByRole("button", { name: /add stop/i }));

    // createStop IS called — empty string reaches the server action
    expect(createStop).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ mode: "rough", name: "" }),
      undefined,
    );
  });

  it("submitting valid rough-mode input calls createStop with the expected payload", async () => {
    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    // Fill in the place name (mode defaults to "rough")
    const nameInput = screen.getByPlaceholderText(/e\.g\. london/i);
    await user.type(nameInput, "Paris");

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    expect(createStop).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        mode: "rough",
        name: "Paris",
      }),
      undefined,
    );
  });

  it("a server-returned field error is displayed after submit", async () => {
    // Override createStop to return a field error for this test
    const { createStop: mockCreateStop } = await import("@/server/actions/stops");
    (mockCreateStop as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { name: ["Name is too short"] },
    });

    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    const nameInput = screen.getByPlaceholderText(/e\.g\. london/i);
    await user.type(nameInput, "X");

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    expect(await screen.findByText("Name is too short")).toBeInTheDocument();
  });

  it("a field error wires aria-invalid to the control via the Field error slot", async () => {
    const { createStop: mockCreateStop } = await import("@/server/actions/stops");
    (mockCreateStop as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { name: ["Name is required"] },
    });

    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    // Error message appears
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    // Control gets aria-invalid
    const nameInput = screen.getByPlaceholderText(/e\.g\. london/i);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
  });

  it("a server-returned _form error appears with role=alert", async () => {
    const { createStop: mockCreateStop } = await import("@/server/actions/stops");
    (mockCreateStop as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Something went wrong on the server"] },
    });

    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on the server");
  });
});
