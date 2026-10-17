import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
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
    await user.selectOptions(screen.getByLabelText("Tuesday"), "closed");
    expect(spy.mock.lastCall![0].week.tue).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add a second opening on Saturday" }));
    expect(spy.mock.lastCall![0].week.sat).toHaveLength(2);
    expect(screen.getByLabelText("Saturday opens again")).toBeInTheDocument();
  });

  it("edits a span's times, including a 24:00 (midnight) close", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={HOURS} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    const closes = screen.getByLabelText("Monday closes");
    await user.clear(closes);
    await user.type(closes, "17:30");
    expect(spy.mock.lastCall![0].week.mon).toEqual([["10:00", "17:30"]]);
    await user.clear(closes);
    await user.type(closes, "24:00");
    expect(spy.mock.lastCall![0].week.mon).toEqual([["10:00", "24:00"]]);
  });

  it("says how to enter hours past midnight, once the hours are added", async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} spy={vi.fn()} />);
    await user.click(screen.getByText("Opening hours"));
    expect(screen.queryByText(/open past midnight/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add opening hours" }));
    expect(screen.getByText("Open past midnight? Use 18:00\u201324:00, then 00:00\u201302:00 on the next day.")).toBeInTheDocument();
  });

  it("displays a stored 24:00 close", () => {
    const midnight: OpeningHours = { week: { ...HOURS.week, mon: [["10:00", "24:00"]] }, seasons: [], closed: [] };
    render(<OpeningHoursEditor value={midnight} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Monday closes")).toHaveValue("24:00");
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

  it("keeps the editor open once opened, even after the error clears", () => {
    const { rerender } = render(<OpeningHoursEditor value={HOURS} onChange={vi.fn()} error="A season must end on or after it starts" />);
    expect(screen.getByText("Opening hours").closest("details")).toHaveAttribute("open");
    rerender(<OpeningHoursEditor value={HOURS} onChange={vi.fn()} />);
    expect(screen.getByText("Opening hours").closest("details")).toHaveAttribute("open");
  });

  describe("three-state weekdays (not set / closed / open)", () => {
    it("a day left not set stays absent after another day is edited", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      const partial: OpeningHours = { week: { mon: span }, seasons: [], closed: [] };
      render(<Harness initial={partial} spy={spy} />);
      await user.click(screen.getByText("Opening hours"));
      expect(screen.getByLabelText("Tuesday")).toHaveValue("unset");
      await user.selectOptions(screen.getByLabelText("Wednesday"), "closed");
      expect(spy.mock.lastCall![0].week.tue).toBeUndefined();
      expect("tue" in spy.mock.lastCall![0].week).toBe(false);
      expect(spy.mock.lastCall![0].week.wed).toEqual([]);
    });

    it("'Same as Monday every day' copies an absent Monday as absent", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      const partial: OpeningHours = { week: { tue: span }, seasons: [], closed: [] };
      render(<Harness initial={partial} spy={spy} />);
      await user.click(screen.getByText("Opening hours"));
      await user.click(screen.getByRole("button", { name: "Same as Monday every day" }));
      const week = spy.mock.lastCall![0].week;
      for (const d of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) expect(d in week).toBe(false);
    });

    it("'Same as Monday every day' copies a set Monday to every day", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      render(<Harness initial={HOURS} spy={spy} />);
      await user.click(screen.getByText("Opening hours"));
      await user.click(screen.getByRole("button", { name: "Same as Monday every day" }));
      const week = spy.mock.lastCall![0].week;
      for (const d of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) expect(week[d]).toEqual(span);
    });

    it("setting a day back to Not set clears it", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      render(<Harness initial={HOURS} spy={spy} />);
      await user.click(screen.getByText("Opening hours"));
      await user.selectOptions(screen.getByLabelText("Friday"), "unset");
      expect("fri" in spy.mock.lastCall![0].week).toBe(false);
    });
  });

  it("a season's own week also uses the three states", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    const partial: OpeningHours = { week: { tue: span }, seasons: [], closed: [] };
    render(<Harness initial={partial} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add a season" }));
    const seasonGrid = screen.getByRole("group", { name: "Season 1 hours" });
    expect(within(seasonGrid).getByLabelText("Monday")).toHaveValue("unset");
    await user.selectOptions(within(seasonGrid).getByLabelText("Monday"), "closed");
    expect(spy.mock.lastCall![0].seasons[0].week.mon).toEqual([]);
    expect("tue" in spy.mock.lastCall![0].seasons[0].week).toBe(true);
  });

  describe("closed dates (YYYY-MM-DD or recurring MM-DD)", () => {
    it("an MM-DD closed date displays and round-trips", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      const withClosed: OpeningHours = { ...HOURS, closed: ["12-25"] };
      render(<Harness initial={withClosed} spy={spy} />);
      await user.click(screen.getByText("Opening hours"));
      const field = screen.getByLabelText("Closed date 1");
      expect(field).toHaveValue("12-25");
      await user.clear(field);
      await user.type(field, "2027-06-10");
      expect(spy.mock.lastCall![0].closed).toEqual(["2027-06-10"]);
    });
  });
});
