import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RangeCalendar } from "./range-calendar";

type R = { start?: string; end?: string };

function Harness(props: { start?: string; end?: string; onChange?: (r: R) => void; months?: 1 | 2; disableBefore?: string; disableAfter?: string }) {
  const [r, setR] = React.useState<R>({ start: props.start, end: props.end });
  return (
    <RangeCalendar
      months={props.months}
      disableBefore={props.disableBefore}
      disableAfter={props.disableAfter}
      start={r.start}
      end={r.end}
      onChange={(n) => {
        props.onChange?.(n);
        setR(n);
      }}
    />
  );
}

const day = (name: string) => screen.getByRole("button", { name });

describe("RangeCalendar", () => {
  it("opens on the month of disableBefore when nothing is picked", () => {
    render(<Harness disableBefore="2026-10-01" />);
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
  });

  it("first click sets the start, the second the end", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} disableBefore="2026-10-01" />);
    await userEvent.click(day("Thu 15 Oct 2026"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-10-15" });
    await userEvent.click(day("Tue 20 Oct 2026"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-10-15", end: "2026-10-20" });
  });

  it("marks the start, the days between and the end", () => {
    render(<Harness start="2026-10-15" end="2026-10-20" />);
    expect(day("Thu 15 Oct 2026")).toHaveAttribute("data-state", "start");
    expect(day("Sat 17 Oct 2026")).toHaveAttribute("data-state", "in");
    expect(day("Tue 20 Oct 2026")).toHaveAttribute("data-state", "end");
    expect(day("Sat 17 Oct 2026")).toHaveAttribute("aria-pressed", "true");
    expect(day("Wed 21 Oct 2026")).toHaveAttribute("aria-pressed", "false");
  });

  it("disables days before disableBefore and ignores clicks on them", async () => {
    const onChange = vi.fn();
    render(<Harness start="2026-10-15" disableBefore="2026-10-10" onChange={onChange} />);
    expect(day("Fri 9 Oct 2026")).toBeDisabled();
    await userEvent.click(day("Fri 9 Oct 2026"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  });

  it("with disableAfter opens on the two months that end there (past mode)", () => {
    render(<Harness months={2} disableAfter="2026-09-30" />);
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("two months: the second card only shows from md", () => {
    render(<Harness months={2} start="2026-12-04" />);
    const second = screen.getByRole("heading", { name: "January 2027" }).closest("[data-month]")!;
    expect(second.className).toMatch(/\bhidden\b/);
    expect(second.className).toMatch(/\bmd:block\b/);
  });

  it("the arrows page one month", async () => {
    render(<Harness start="2026-10-15" />);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });

  it("previews the band while choosing the end (MOTION N8)", () => {
    render(<Harness start="2026-10-15" />);
    fireEvent.mouseEnter(day("Sat 17 Oct 2026"));
    expect(day("Fri 16 Oct 2026")).toHaveAttribute("data-state", "preview");
  });

  it("arrow keys move focus between days (one tab stop)", async () => {
    render(<Harness start="2026-10-15" />);
    const start = day("Thu 15 Oct 2026");
    expect(start).toHaveAttribute("tabindex", "0");
    expect(day("Fri 16 Oct 2026")).toHaveAttribute("tabindex", "-1");
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(day("Fri 16 Oct 2026")));
  });

  it("paints the band with the range token only", () => {
    const { container } = render(<Harness start="2026-10-15" end="2026-10-20" />);
    expect(container.innerHTML).toMatch(/bg-range/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });

  it("finishing a range fills the band day by day, 12ms apart, and pops the end (MOTION N8)", async () => {
    render(<Harness disableBefore="2026-10-01" />);
    await userEvent.click(day("Thu 15 Oct 2026"));
    expect(day("Thu 15 Oct 2026").querySelector(".tp-pop")).not.toBeNull();
    expect(day("Sat 17 Oct 2026").querySelector(".tp-band-fill")).toBeNull();
    await userEvent.click(day("Tue 20 Oct 2026"));
    const band = day("Sat 17 Oct 2026").querySelector(".tp-band-fill") as HTMLElement;
    expect(band.style.animationDelay).toBe("24ms");
    expect(day("Tue 20 Oct 2026").querySelector(".tp-pop")).not.toBeNull();
    expect(day("Thu 15 Oct 2026").querySelector(".tp-pop")).toBeNull();
  });

  it("caps the stagger at 240ms", async () => {
    render(<Harness months={2} disableBefore="2026-10-01" />);
    await userEvent.click(day("Thu 1 Oct 2026"));
    await userEvent.click(day("Sat 31 Oct 2026"));
    expect((day("Fri 30 Oct 2026").querySelector(".tp-band-fill") as HTMLElement).style.animationDelay).toBe("240ms");
  });

  it("a range that was already there when it mounted does not fill", () => {
    render(<Harness start="2026-10-15" end="2026-10-20" />);
    expect(document.querySelector(".tp-band-fill, .tp-pop")).toBeNull();
  });
});
