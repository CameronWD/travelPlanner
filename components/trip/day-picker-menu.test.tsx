import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DayPickerMenu } from "./day-picker-menu";

const days = ["2026-12-05", "2026-12-06", "2026-12-07"];

it("lists each day of the stay and reports the picked day", async () => {
  const user = userEvent.setup();
  const onPick = vi.fn();
  render(<DayPickerMenu days={days} label="Pick a day for Louvre" onPick={onPick} />);
  await user.click(screen.getByRole("button", { name: "Pick a day for Louvre" }));
  await user.click(await screen.findByRole("menuitem", { name: "Sun 6 Dec" }));
  expect(onPick).toHaveBeenCalledWith("2026-12-06");
});

it("disables the item's current day", async () => {
  const user = userEvent.setup();
  render(
    <DayPickerMenu days={days} label="Move Louvre" onPick={() => {}} currentDate="2026-12-06" />,
  );
  await user.click(screen.getByRole("button", { name: "Move Louvre" }));
  const current = await screen.findByRole("menuitem", { name: "Sun 6 Dec" });
  expect(current).toHaveAttribute("aria-disabled", "true");
});

it("renders nothing when there are no days", () => {
  const { container } = render(<DayPickerMenu days={[]} label="x" onPick={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

it("renders a custom trigger when given", async () => {
  render(<DayPickerMenu days={["2026-12-11"]} label="Pick a day for X" onPick={vi.fn()} trigger={<button>X chip</button>} />);
  await userEvent.click(screen.getByRole("button", { name: "X chip" }));
  expect(await screen.findByRole("menuitem", { name: "Fri 11 Dec" })).toBeInTheDocument();
});
