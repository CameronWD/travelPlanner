import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Must be declared before component imports so vi.mock hoisting works.
vi.mock("@/server/actions/trips", () => ({
  duplicateTrip: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ProjectTable } from "@/components/discreet/project-table";

describe("ProjectTable", () => {
  it("renders one linked row per project", () => {
    render(
      <ProjectTable
        projects={[
          { id: "t1", name: "South Island", dateRange: "12–22 Jul 2026", status: "Planning", locations: 6 },
          { id: "t2", name: "Japan", dateRange: "Dates TBC", status: "Upcoming", locations: 3 },
        ]}
      />,
    );
    expect(screen.getByText("South Island")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /South Island/i })).toHaveAttribute("href", "/trips/t1");
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  });
});
