import type { Route } from "next";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaysHrefProvider, useDaysHref } from "./days-href-context";

function Probe() {
  return <output>{useDaysHref() ?? "null"}</output>;
}

describe("DaysHrefProvider", () => {
  it("supplies the Days target to descendants and null outside it", () => {
    render(<DaysHrefProvider href={"/trips/t1/day/2026-12-04" as Route}><Probe /></DaysHrefProvider>);
    expect(screen.getByText("/trips/t1/day/2026-12-04")).toBeInTheDocument();
    render(<Probe />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});
