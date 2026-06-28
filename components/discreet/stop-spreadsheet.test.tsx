import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StopSpreadsheet } from "@/components/discreet/stop-spreadsheet";
import type { SheetRow } from "@/lib/discreet";
import { setStopNotes } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";

vi.mock("@/server/actions/stops", () => ({ setStopNotes: vi.fn(), setStopNights: vi.fn(), setStopDates: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

const rows: SheetRow[] = [
  { id: "s1", location: "Queenstown", country: "NZ", arriveDate: "2026-07-12", departDate: "2026-07-15", nights: 3, scheduled: true, pinned: false, transportInLabel: "Flight", stayLabel: "Hotel A", estCostMinor: 42000, notes: "arrive pm" },
  { id: "s2", location: "Milford", country: "NZ", arriveDate: null, departDate: null, nights: 1, scheduled: false, pinned: false, transportInLabel: "Car", stayLabel: null, estCostMinor: 0, notes: null },
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
});

describe("StopSpreadsheet (a11y + cost formatting)", () => {
  it("formats the estimated cost and marks pinned rows", () => {
    render(<StopSpreadsheet tripId="t1" rows={[{ ...rows[0], pinned: true }]} homeCurrency="AUD" />);
    expect(screen.getByText(/\$\s?420\.00/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pinned" })).toBeInTheDocument();
  });
});
