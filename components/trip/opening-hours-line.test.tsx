import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpeningHoursLine } from "./opening-hours-line";

const span = [["10:00", "18:00"]] as [string, string][];
const HOURS = { week: { mon: span, tue: [], wed: span, thu: span, fri: span, sat: span, sun: span }, seasons: [], closed: [] };

describe("OpeningHoursLine", () => {
  it("shows the day's hours, 'today' only on today", () => {
    const { rerender } = render(<OpeningHoursLine hours={HOURS} dateISO="2027-06-02" />);
    expect(screen.getByTestId("opening-hours-line")).toHaveTextContent("Open 10:00–18:00");
    rerender(<OpeningHoursLine hours={HOURS} dateISO="2027-06-02" today />);
    expect(screen.getByTestId("opening-hours-line")).toHaveTextContent("Open 10:00–18:00 today");
  });

  it("marks a closed day", () => {
    render(<OpeningHoursLine hours={HOURS} dateISO="2027-06-01" />);
    const line = screen.getByTestId("opening-hours-line");
    expect(line).toHaveTextContent("Closed on Tuesdays");
    expect(line).toHaveAttribute("data-closed", "true");
  });

  it("renders nothing without hours or a date", () => {
    const { container } = render(<><OpeningHoursLine hours={null} dateISO="2027-06-02" /><OpeningHoursLine hours={HOURS} dateISO={null} /></>);
    expect(container).toBeEmptyDOMElement();
  });
});
