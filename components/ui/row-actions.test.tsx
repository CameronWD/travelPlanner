import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActions } from "./row-actions";

describe("RowActions", () => {
  it("renders only the buttons whose handlers are provided", () => {
    render(<RowActions onEdit={() => {}} />);
    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });
  it("fires edit and delete handlers", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<RowActions onEdit={onEdit} onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText("Edit"));
    await userEvent.click(screen.getByLabelText("Delete"));
    expect(onEdit).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
  it("expands the tap target on coarse pointers", () => {
    render(<RowActions onEdit={() => {}} onDelete={() => {}} />);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.className).toContain("pointer-coarse:after:-inset-1.5");
    }
  });
  it("while loading, shows the delete as busy and blocks both buttons", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<RowActions onEdit={onEdit} onDelete={onDelete} loading />);
    const del = screen.getByLabelText("Delete");
    expect(del).toHaveAttribute("aria-busy", "true");
    expect(del).toBeDisabled();
    expect(screen.getByLabelText("Edit")).toBeDisabled();
    await userEvent.click(del);
    expect(onDelete).not.toHaveBeenCalled();
  });
  it("is not busy when not loading", () => {
    render(<RowActions onEdit={() => {}} onDelete={() => {}} disabled={false} />);
    expect(screen.getByLabelText("Delete")).not.toHaveAttribute("aria-busy");
    expect(screen.getByLabelText("Delete")).toBeEnabled();
  });
});
