import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const clearErrorReport = vi.fn();
const clearAllErrorReports = vi.fn();
vi.mock("@/server/actions/error-reports", () => ({
  get clearErrorReport() { return clearErrorReport; },
  get clearAllErrorReports() { return clearAllErrorReports; },
}));

import { ErrorReportsPanel } from "./error-reports";
import type { ErrorReportView } from "@/server/actions/error-reports";

const NOW = new Date("2026-09-22T12:00:00.000Z");

const reports: ErrorReportView[] = [
  {
    id: "er1",
    signature: "aaaa",
    message: "Cannot read properties of undefined",
    route: "/trips/t1/plan",
    source: "client",
    digest: null,
    count: 3,
    firstSeen: "2026-09-20T00:00:00.000Z",
    lastSeen: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "er2",
    signature: "bbbb",
    message: "connect ETIMEDOUT",
    route: null,
    source: "server",
    digest: "d1",
    count: 1,
    firstSeen: "2026-09-21T00:00:00.000Z",
    lastSeen: "2026-09-21T00:00:00.000Z",
  },
];

describe("ErrorReportsPanel", () => {
  beforeEach(() => {
    clearErrorReport.mockReset().mockResolvedValue({ success: true });
    clearAllErrorReports.mockReset().mockResolvedValue({ success: true });
  });

  it("renders an empty state when there is nothing to show", () => {
    render(<ErrorReportsPanel initial={[]} now={NOW} />);
    expect(screen.getByText(/no errors reported/i)).toBeInTheDocument();
  });

  it("clears one row and drops it from the list", async () => {
    render(<ErrorReportsPanel initial={reports} now={NOW} />);
    await userEvent.click(
      screen.getByRole("button", { name: /clear Cannot read properties of undefined/i }),
    );

    expect(clearErrorReport).toHaveBeenCalledWith("er1");
    await waitFor(() =>
      expect(screen.queryByText("Cannot read properties of undefined")).not.toBeInTheDocument(),
    );
  });

  // Final fix wave: handleClear/handleClearAll had no try/catch, so a
  // rejection — requireAdmin's notFound(), a dropped connection, a deploy
  // mid-click — skipped the loading reset and left the button spinning
  // forever with nothing said. A stuck spinner reads as "still working".
  it("recovers from a rejected per-row clear instead of spinning forever", async () => {
    clearErrorReport.mockRejectedValue(new Error("boom"));
    render(<ErrorReportsPanel initial={reports} now={NOW} />);

    const button = screen.getByRole("button", { name: /clear connect ETIMEDOUT/i });
    await userEvent.click(button);

    expect(await screen.findByText(/couldn't clear that error/i)).toBeInTheDocument();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy", "true"));
    // The row is still there — nothing was optimistically removed.
    expect(screen.getByText("connect ETIMEDOUT")).toBeInTheDocument();
  });

  it("recovers from a rejected Clear all instead of spinning forever", async () => {
    clearAllErrorReports.mockRejectedValue(new Error("boom"));
    render(<ErrorReportsPanel initial={reports} now={NOW} />);

    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear all" }));

    expect(await screen.findByText(/couldn't clear all errors/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /clear all/i })).not.toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
  });

  // clearAllErrorReports is deleteMany({}) while this list is capped at
  // listErrorReports' LIST_LIMIT, so a confirm citing the rendered count
  // understated the blast radius exactly when the table was biggest.
  it("does not put the rendered row count in the Clear all confirm", async () => {
    render(<ErrorReportsPanel initial={reports} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));

    const heading = await screen.findByRole("heading", { name: /clear every reported error\?/i });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).not.toMatch(/\d/);
    expect(
      screen.getByText(/including any beyond the ones listed here/i),
    ).toBeInTheDocument();
  });

  it("cancelling the Clear all confirm calls nothing", async () => {
    render(<ErrorReportsPanel initial={reports} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(clearAllErrorReports).not.toHaveBeenCalled();
  });
});
