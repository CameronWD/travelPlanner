import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StopSpreadsheet } from "@/components/discreet/stop-spreadsheet";
import type { SheetRow } from "@/lib/discreet";
import { setStopNotes, setStopNights, setStopDates } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";
import { formatLongDate } from "@/lib/dates";

vi.mock("@/server/actions/stops", () => ({ setStopNotes: vi.fn(), setStopNights: vi.fn(), setStopDates: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

// Fixture note: Milford nights is 7 (not 1) to avoid collision with row-number "1"
// rendered in the first column. Queenstown nights=3 is unambiguous.
const rows: SheetRow[] = [
  { id: "s1", location: "Queenstown", country: "NZ", arriveDate: "2026-07-12", departDate: "2026-07-15", nights: 3, scheduled: true, pinned: false, transportInLabel: "Flight", stayLabel: "Hotel A", estCostMinor: 42000, notes: "arrive pm" },
  { id: "s2", location: "Milford", country: "NZ", arriveDate: null, departDate: null, nights: 7, scheduled: false, pinned: false, transportInLabel: "Car", stayLabel: null, estCostMinor: 0, notes: null },
];

describe("StopSpreadsheet (read-only)", () => {
  it("renders a row per stop with derived values", () => {
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    expect(screen.getByText("Queenstown")).toBeInTheDocument();
    expect(screen.getByText("Milford")).toBeInTheDocument();
    expect(screen.getByText("Flight")).toBeInTheDocument();
  });
  it("blanks dates for rough stops", () => {
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});

describe("StopSpreadsheet (inline notes editing)", () => {
  it("edits notes inline and calls setStopNotes", async () => {
    vi.mocked(setStopNotes).mockResolvedValue({ success: true });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    fireEvent.click(screen.getByText("arrive pm"));
    const input = screen.getByDisplayValue("arrive pm");
    fireEvent.change(input, { target: { value: "arrive 6pm" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(setStopNotes).toHaveBeenCalledWith("s1", "arrive 6pm"));
  });

  it("reverts + toasts when the notes save fails", async () => {
    vi.mocked(setStopNotes).mockResolvedValue({ success: false, errors: {} });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    fireEvent.click(screen.getByText("arrive pm"));
    const input = screen.getByDisplayValue("arrive pm");
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.getByText("arrive pm")).toBeInTheDocument(); // reverted
  });

  it("Escape discards the draft without saving", () => {
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    fireEvent.click(screen.getByText("arrive pm"));
    const input = screen.getByDisplayValue("arrive pm");
    fireEvent.change(input, { target: { value: "discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByDisplayValue("discarded")).not.toBeInTheDocument();
    expect(setStopNotes).not.toHaveBeenCalled();
  });
});

describe("StopSpreadsheet (a11y + cost formatting)", () => {
  it("formats the estimated cost and marks pinned rows", () => {
    render(<StopSpreadsheet tripId="t1" rows={[{ ...rows[0], pinned: true }]} homeCurrency="AUD" />);
    expect(screen.getByText(/\$\s?420\.00/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pinned" })).toBeInTheDocument();
  });
});

describe("StopSpreadsheet (inline revert feedback)", () => {
  it("marks the notes cell aria-invalid when the save is rejected and restores the prior value", async () => {
    vi.mocked(setStopNotes).mockResolvedValue({ success: false, errors: {} });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    fireEvent.click(screen.getByText("arrive pm"));
    const input = screen.getByDisplayValue("arrive pm");
    fireEvent.change(input, { target: { value: "bad value" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // After rejection: cell should revert and the td should carry aria-invalid="true"
    await waitFor(() => expect(screen.getByText("arrive pm")).toBeInTheDocument());
    const cell = screen.getByText("arrive pm").closest("td");
    expect(cell).toHaveAttribute("aria-invalid", "true");
  });

  it("clears aria-invalid after ~3 seconds", async () => {
    // Fake timers WITHOUT shouldAdvanceTime: we advance the 3s auto-clear
    // manually below. (shouldAdvanceTime let real wall-clock — which balloons
    // under CI/sandbox load — fire the timer early and race the assertion.)
    vi.useFakeTimers();
    try {
      vi.mocked(setStopNotes).mockResolvedValue({ success: false, errors: {} });
      render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
      fireEvent.click(screen.getByText("arrive pm"));
      const input = screen.getByDisplayValue("arrive pm");
      fireEvent.change(input, { target: { value: "bad value" } });
      fireEvent.keyDown(input, { key: "Enter" });
      // Flush the async save rejection + transition deterministically. We do
      // NOT use waitFor here: with fake timers installed it advances them while
      // polling, which would fire the very 3s auto-clear this test is checking.
      await act(async () => {});
      const cell = screen.getByText("arrive pm").closest("td");
      expect(cell).toHaveAttribute("aria-invalid", "true");
      // Deterministically fire the 3s auto-clear.
      await act(async () => { vi.advanceTimersByTime(3100); });
      expect(cell).not.toHaveAttribute("aria-invalid", "true");
    } finally {
      // Restore real timers even if an assertion throws, so fake timers can
      // never leak into sibling tests in this file.
      vi.useRealTimers();
    }
  });

  it("marks the nights cell aria-invalid when setStopNights is rejected", async () => {
    vi.mocked(setStopNights).mockResolvedValue({ success: false, errors: {} });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    fireEvent.click(screen.getByText("7")); // Milford nights
    const input = screen.getByDisplayValue("7");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    const cell = screen.getByText("7").closest("td");
    expect(cell).toHaveAttribute("aria-invalid", "true");
  });
});

describe("StopSpreadsheet (inline nights editing)", () => {
  it("edits nights inline and calls setStopNights", async () => {
    vi.mocked(setStopNights).mockResolvedValue({ success: true });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    // Milford (rough) nights = 7 — distinct from any row number
    fireEvent.click(screen.getByText("7"));
    const input = screen.getByDisplayValue("7");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(setStopNights).toHaveBeenCalledWith("s2", 4));
  });

  it("shows the ripple heads-up toast on conflicts", async () => {
    vi.mocked(setStopNights).mockResolvedValue({ success: true, conflicts: [{ stopId: "x", message: "conflict" }] });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    // Queenstown (scheduled) nights = 3
    fireEvent.click(screen.getByText("3"));
    const input = screen.getByDisplayValue("3");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/pinned/i) })));
  });
});

describe("StopSpreadsheet (inline dates editing)", () => {
  it("edits a scheduled stop's depart date via setStopDates", async () => {
    vi.mocked(setStopDates).mockResolvedValue({ success: true });
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    // Queenstown depart = 2026-07-15 → "Wed 15 Jul 2026". Scope to the Depart column cell.
    // The arrive date "Sun 12 Jul 2026" is distinct, so we can use getAllByText and pick index 0
    // for depart since it's the only occurrence of that formatted date.
    fireEvent.click(screen.getByText(formatLongDate("2026-07-15")));
    const input = screen.getByDisplayValue("2026-07-15");
    fireEvent.change(input, { target: { value: "2026-07-16" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(setStopDates).toHaveBeenCalledWith("s1", { arriveDate: "2026-07-12", departDate: "2026-07-16" }));
  });

  it("does not make rough-stop date cells editable", () => {
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    // Milford (s2) is rough: arrive/depart render as "—". Clicking must not open a date input.
    const dashes = screen.getAllByText("—");
    fireEvent.click(dashes[0]);
    expect(screen.queryByDisplayValue("")).not.toBeInTheDocument();
    // no date input appeared
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
  });
});
