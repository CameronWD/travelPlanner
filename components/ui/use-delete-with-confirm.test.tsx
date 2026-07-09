import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { useDeleteWithConfirm } from "./use-delete-with-confirm";

function Harness({ action }: { action: (id: string) => Promise<{ success: true } | { success: false; errors: Record<string, string[]> }> }) {
  const { requestDelete, dialog } = useDeleteWithConfirm({
    action,
    buildConfirm: (id: string) => ({ title: `Delete ${id}?`, destructive: true, confirmLabel: "Delete" }),
  });
  return (
    <>
      <button onClick={() => requestDelete("x1")}>trigger</button>
      {dialog}
    </>
  );
}

describe("useDeleteWithConfirm", () => {
  it("runs the action only after the user confirms", async () => {
    const action = vi.fn(async () => ({ success: true as const }));
    render(<Harness action={action} />);
    await userEvent.click(screen.getByText("trigger"));
    expect(screen.getByText("Delete x1?")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(action).toHaveBeenCalledWith("x1");
  });
});
