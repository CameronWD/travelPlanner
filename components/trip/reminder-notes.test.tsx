import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReminderNotes } from "./reminder-notes";

describe("ReminderNotes (spec F8: folded, tap to expand)", () => {
  it("starts folded and opens on tap", async () => {
    const user = userEvent.setup();
    render(<ReminderNotes notes={"Door code 4411\nRing twice"} />);
    expect(screen.getByText(/Door code 4411/)).not.toBeVisible();
    await user.click(screen.getByText("Notes"));
    expect(screen.getByText(/Door code 4411/)).toBeVisible();
  });
});
