import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { DayChromeRegistryContext } from "@/components/trip/day/day-carousel";
import { DayChromeRegistry, RegisterDayChrome } from "@/components/trip/day/day-chrome-registry";

// The registry module also holds the carousel frame, whose fallback header pulls in server actions.
vi.mock("@/components/trip/day/day-header", () => ({ DayHeader: () => null }));

function Shown({ iso }: { iso: string }) {
  const { chromeFor } = React.useContext(DayChromeRegistryContext);
  return <>{chromeFor(iso)}</>;
}

describe("DayChromeRegistry", () => {
  it("follows the seed it is given now, over an older registration, so a day change that keeps the carousel mounted shows the new day's header", () => {
    const { rerender } = render(
      <DayChromeRegistry seed={{ "2026-12-12": <h1>Sat 12 Dec</h1> }}>
        <RegisterDayChrome iso="2026-12-12" chrome={<h1>Sat 12 Dec</h1>} />
        <Shown iso="2026-12-12" />
      </DayChromeRegistry>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Sat 12 Dec");
    rerender(
      <DayChromeRegistry seed={{ "2026-12-12": <h1>Sat 12 Dec · edited</h1>, "2026-12-13": <h1>Sun 13 Dec</h1> }}>
        <Shown iso="2026-12-12" />
      </DayChromeRegistry>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Sat 12 Dec · edited");
  });
});
