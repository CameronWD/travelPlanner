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
});
