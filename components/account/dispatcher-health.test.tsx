import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DispatcherHealth } from "@/components/account/dispatcher-health";

/**
 * Covers both registers `formatLastRun` (lib/cron-health.ts) switches
 * between, and the plain "Digests are not being sent" statement Ambiguity 3
 * requires once stale — a Traveller reading this has already been taught by
 * the Digest panel that silence is normal, so the stale state has to say so
 * without euphemism.
 */
const NOW = new Date("2026-12-10T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DispatcherHealth", () => {
  it("reads as reassurance while healthy", () => {
    render(
      <DispatcherHealth now={NOW} lastRunAt={new Date("2026-12-10T10:00:00.000Z")} stale={false} />,
    );
    expect(screen.getByText(/last ran 2 hours ago/)).toBeInTheDocument();
    expect(screen.queryByText(/not being sent/i)).not.toBeInTheDocument();
  });

  it("says plainly that Digests are not being sent once stale", () => {
    render(
      <DispatcherHealth now={NOW} lastRunAt={new Date("2026-12-01T10:00:00.000Z")} stale={true} />,
    );
    expect(screen.getByText(/1 Dec 2026/)).toBeInTheDocument();
    expect(screen.getByText(/digests are not being sent/i)).toBeInTheDocument();
  });

  it("says plainly that Digests are not being sent when it has never run", () => {
    render(<DispatcherHealth now={NOW} lastRunAt={null} stale={true} />);
    expect(screen.getByText(/never run/)).toBeInTheDocument();
    expect(screen.getByText(/digests are not being sent/i)).toBeInTheDocument();
  });

  it("never says \"notification\" — CONTEXT.md reserves that word for the Activity bell", () => {
    render(
      <DispatcherHealth now={NOW} lastRunAt={new Date("2026-12-01T10:00:00.000Z")} stale={true} />,
    );
    expect(screen.queryByText(/notification/i)).not.toBeInTheDocument();
  });

  it("reads its clock from the server, not from its own render", () => {
    // CD-05: `new Date()` in a "use client" render makes the server and the
    // browser compute different `now`s — a guaranteed hydration text mismatch
    // on the stale branch, which formats a local calendar date.
    vi.setSystemTime(new Date("2027-05-05T12:00:00.000Z"));
    render(
      <DispatcherHealth
        now={NOW}
        lastRunAt={new Date("2026-12-10T10:00:00.000Z")}
        stale={false}
      />,
    );
    // The component's own clock now says 2027; the prop says 2026-12-10 12:00.
    expect(screen.getByText(/last ran 2 hours ago/)).toBeInTheDocument();
  });
});
