// @vitest-environment jsdom
import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readUsageTrip = vi.fn();
const setUsageRecording = vi.fn();
vi.mock("@/server/actions/usage", () => ({
  get readUsageTrip() {
    return readUsageTrip;
  },
  get setUsageRecording() {
    return setUsageRecording;
  },
}));
vi.mock("@/lib/tz", () => ({ deviceTimeZone: () => "Australia/Brisbane" }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label="Trip" defaultValue="" onChange={(e) => onValueChange(e.target.value)}>
      <option value="" disabled>
        Pick a Trip
      </option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import { UsagePanel } from "./usage";
import type { UsageOverviewView } from "@/server/actions/usage";
import type { UsageTripReport } from "@/lib/usage/report";

const NOW = new Date("2026-12-02T12:00:00.000Z");

const overview: UsageOverviewView = {
  recording: true,
  total: 1204,
  fromOtherSites: 12,
  lastReceivedAt: "2026-12-02T09:00:00.000Z",
  trips: [
    { id: "t1", name: "Northvale" },
    { id: "t2", name: "Westby" },
  ],
};

const report: UsageTripReport = {
  fromOtherSites: 2,
  ai: { microUsd: 420_000, runs: 2, unpriced: 1 },
  google: { from: "2026-12-01", to: "2027-01-09", calls: [{ sku: "routes", count: 120 }, { sku: "static maps", count: 40 }] },
  travellers: [
    {
      userId: "u1",
      name: "Olive Northvale",
      days: [
        {
          day: "2026-12-02",
          screens: { day: 12, plan: 3 },
          actions: [
            { action: "day-changed", detail: "swipe", count: 20 },
            { action: "day-changed", detail: "chip", count: 2 },
          ],
          screenCount: 15,
          actionCount: 22,
          medianMs: 300,
          savedCopies: 2,
        },
        { day: "2026-12-01", screens: { money: 1 }, actions: [], screenCount: 1, actionCount: 0, medianMs: null, savedCopies: 0 },
      ],
    },
    { userId: "u2", name: "A former Traveller", days: [] },
  ],
};

beforeEach(() => {
  readUsageTrip.mockReset().mockResolvedValue(report);
  setUsageRecording.mockReset().mockResolvedValue({ success: true });
});

describe("UsagePanel", () => {
  it("says so when the figures could not be read, and still shows a working switch", async () => {
    render(<UsagePanel recording={true} initial={null} now={NOW} />);
    expect(screen.getByText("Couldn’t read Usage just now.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Recording" }));
    expect(setUsageRecording).toHaveBeenCalledWith(false);
  });

  it("offers both actions when the switch itself could not be read", async () => {
    render(<UsagePanel recording={null} initial={null} now={NOW} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn recording on" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn recording off" }));
    expect(setUsageRecording).toHaveBeenCalledWith(false);
  });

  it("shows the switch on, the main site’s total and how many came from elsewhere", () => {
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    expect(screen.getByRole("switch", { name: "Recording" })).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText("1204 records. The last one arrived 3h ago. 12 more came from beta and other sites."),
    ).toBeInTheDocument();
  });

  it("drops the other-sites sentence when there are none", () => {
    render(<UsagePanel recording={true} initial={{ ...overview, fromOtherSites: 0 }} now={NOW} />);
    expect(screen.getByText("1204 records. The last one arrived 3h ago.")).toBeInTheDocument();
  });

  it("says the main site has none when only other sites have records", () => {
    render(<UsagePanel recording={true} initial={{ ...overview, total: 0, lastReceivedAt: null }} now={NOW} />);
    expect(screen.getByText("No records from the main site yet. 12 came from beta and other sites.")).toBeInTheDocument();
  });

  it("says there are no records yet", () => {
    render(<UsagePanel recording={true} initial={{ ...overview, total: 0, fromOtherSites: 0, lastReceivedAt: null }} now={NOW} />);
    expect(screen.getByText("No records yet.")).toBeInTheDocument();
  });

  it("flips the switch off, saves it, and keeps it off", async () => {
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.click(screen.getByRole("switch", { name: "Recording" }));

    expect(setUsageRecording).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "Recording" })).toHaveAttribute("aria-checked", "false");
  });

  it("puts the switch back and says so when the action throws", async () => {
    setUsageRecording.mockRejectedValue(new Error("db down"));
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.click(screen.getByRole("switch", { name: "Recording" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "Recording" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("Couldn’t change that. Try again.")).toBeInTheDocument();
  });

  it("disables the switch while a change is pending", async () => {
    let release: (r: { success: true }) => void = () => {};
    setUsageRecording.mockReturnValue(new Promise((res) => (release = res)));
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.click(screen.getByRole("switch", { name: "Recording" }));

    expect(screen.getByRole("switch", { name: "Recording" })).toBeDisabled();
    release({ success: true });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Recording" })).toBeEnabled());
    expect(setUsageRecording).toHaveBeenCalledTimes(1);
  });

  it("puts the switch back and says why when the change is refused", async () => {
    setUsageRecording.mockResolvedValue({ success: false, errors: { _: ["Not allowed."] } });
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.click(screen.getByRole("switch", { name: "Recording" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "Recording" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("Not allowed.")).toBeInTheDocument();
  });

  it("reads a picked Trip in the device’s zone and shows one details per day", async () => {
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");

    expect(readUsageTrip).toHaveBeenCalledWith("t1", "Australia/Brisbane");
    expect(await screen.findByRole("heading", { name: "Olive Northvale" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A former Traveller" })).toBeInTheDocument();
    expect(screen.getByText("Wed 2 Dec · 15 screens · 22 actions · median 300 ms · 2 from a saved copy")).toBeInTheDocument();
    expect(screen.getByText("Tue 1 Dec · 1 screen · 0 actions")).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(2);
  });

  it("lists screens and actions as counts, with the Day view total and no hidden marker", async () => {
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");
    await screen.findByRole("heading", { name: "Olive Northvale" });

    const screens = within(screen.getAllByRole("list", { name: "Screens" })[0]);
    expect(screens.getByText("Day view 12")).toBeInTheDocument();
    expect(screens.getByText("Plan 3")).toBeInTheDocument();
    const actions = within(screen.getAllByRole("list", { name: "Actions" })[0]);
    expect(actions.getByText("Changed day by swipe 20")).toBeInTheDocument();
    expect(actions.getByText("Changed day by chip 2")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/hidden|surprise/i);
  });

  it("shows the costs lines, with Google labelled as covering every Trip", async () => {
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");

    expect(await screen.findByText("AI: US$0.42 across 2 runs, 1 with no price")).toBeInTheDocument();
    expect(screen.getByText("Google calls on every Trip, 1 Dec to 9 Jan: routes 120, static maps 40")).toBeInTheDocument();
    expect(screen.getByText(/2 more records for this Trip came from beta or other sites/)).toBeInTheDocument();
    expect(screen.getByText("The AI and Google counts include beta, which they can’t tell apart.")).toBeInTheDocument();
  });

  it("says when there were no Google calls, and shows nothing for a Trip without dates", async () => {
    readUsageTrip.mockResolvedValue({ ...report, google: { ...report.google!, calls: [] } });
    const { unmount } = render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");
    expect(await screen.findByText("No Google calls in those dates")).toBeInTheDocument();
    unmount();

    readUsageTrip.mockResolvedValue({ ...report, google: null });
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t2");
    await screen.findByRole("heading", { name: "Olive Northvale" });
    expect(screen.queryByText(/Google calls/)).not.toBeInTheDocument();
  });

  it("says Loading… while it reads", async () => {
    let release: (r: UsageTripReport) => void = () => {};
    readUsageTrip.mockReturnValue(new Promise<UsageTripReport>((res) => (release = res)));
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    release(report);
    await screen.findByRole("heading", { name: "Olive Northvale" });
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it.each([
    ["null", () => readUsageTrip.mockResolvedValue(null)],
    ["a throw", () => readUsageTrip.mockRejectedValue(new Error("down"))],
  ])("says it couldn’t read the Trip on %s", async (_, arrange) => {
    arrange();
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");
    expect(await screen.findByText("Couldn’t read Usage just now.")).toBeInTheDocument();
  });

  it("keeps the newest pick when two reads overlap", async () => {
    let releaseFirst: (r: UsageTripReport) => void = () => {};
    readUsageTrip
      .mockReturnValueOnce(new Promise<UsageTripReport>((res) => (releaseFirst = res)))
      .mockResolvedValueOnce({ ...report, travellers: [{ userId: "u9", name: "Wren Westby", days: [] }] });
    render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t2");
    await screen.findByRole("heading", { name: "Wren Westby" });
    releaseFirst(report);
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "Olive Northvale" })).not.toBeInTheDocument();
  });

  it("has no fixed widths or horizontal overflow classes, so it holds at 320 px", async () => {
    const { container } = render(<UsagePanel recording={true} initial={overview} now={NOW} />);
    await userEvent.selectOptions(screen.getByLabelText("Trip"), "t1");
    await screen.findByRole("heading", { name: "Olive Northvale" });

    const classes = Array.from(container.querySelectorAll("[class]"))
      .filter((el) => !el.closest("[role=switch]"))
      .map((el) => el.getAttribute("class") ?? "")
      .join(" ");
    expect(classes).not.toMatch(/overflow-x-(auto|scroll)|\bw-\[\d|\bmin-w-\[\d|\btable\b/);
    expect(container.querySelector("table")).toBeNull();
    for (const badge of container.querySelectorAll("ul[aria-label] span")) {
      expect(badge.className).toContain("break-words");
      expect(badge.className).toContain("whitespace-normal");
    }
  });
});
