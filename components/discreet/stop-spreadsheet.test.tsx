import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StopSpreadsheet } from "@/components/discreet/stop-spreadsheet";
import type { SheetRow } from "@/lib/discreet";

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
