import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OpeningHours } from "@/lib/opening-hours";
import { OpeningHoursEditor } from "./opening-hours-editor";

function Harness({ initial, spy }: { initial: OpeningHours | null; spy: (v: OpeningHours | null) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <OpeningHoursEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        spy(v);
      }}
    />
  );
}
const span = [["10:00", "18:00"]] as [string, string][];
const HOURS: OpeningHours = {
  week: { sun: span, mon: span, tue: span, wed: span, thu: span, fri: span, sat: span },
  seasons: [],
  closed: [],
};

describe("OpeningHoursEditor", () => {
  it("starts collapsed with a one-line summary, and 'Not set' with none", () => {
    const { rerender } = render(<OpeningHoursEditor value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Opening hours").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Not set")).toBeInTheDocument();
    rerender(<OpeningHoursEditor value={HOURS} onChange={vi.fn()} />);
    expect(screen.getByText("Every day 10:00–18:00")).toBeInTheDocument();
  });

  it("adds hours, closes a weekday and gives a day a second opening", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={null} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add opening hours" }));
    await user.click(screen.getByRole("checkbox", { name: "Tuesday closed" }));
    expect(spy.mock.lastCall![0].week.tue).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add a second opening on Saturday" }));
    expect(spy.mock.lastCall![0].week.sat).toHaveLength(2);
    expect(screen.getByLabelText("Saturday opens again")).toBeInTheDocument();
  });

  it("edits a span's times", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={HOURS} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    const closes = screen.getByLabelText("Monday closes");
    await user.clear(closes);
    await user.type(closes, "17:30");
    expect(spy.mock.lastCall![0].week.mon).toEqual([["10:00", "17:30"]]);
  });

  it("adds a season with its own week and a closed date, and removes the hours", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={HOURS} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add a season" }));
    expect(spy.mock.lastCall![0].seasons).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Season 1 hours" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a closed date" }));
    expect(spy.mock.lastCall![0].closed).toEqual([""]);
    await user.click(screen.getByRole("button", { name: "Remove opening hours" }));
    expect(spy.mock.lastCall![0]).toBeNull();
  });

  it("shows the server's error", async () => {
    render(<OpeningHoursEditor value={HOURS} onChange={vi.fn()} error="A season must end on or after it starts" />);
    expect(screen.getByText("A season must end on or after it starts")).toBeInTheDocument();
  });
});
