import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { useConfirm } from "./confirm-dialog";

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <div>
      <button onClick={async () => onResult(await confirm({ title: "Delete Paris?", confirmLabel: "Delete", destructive: true }))}>
        open
      </button>
      {dialog}
    </div>
  );
}

describe("useConfirm", () => {
  it("resolves true when the confirm button is clicked", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByText("open"));
    expect(await screen.findByText("Delete Paris?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("resolves false when cancelled", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByText("open"));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
