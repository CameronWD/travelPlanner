import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { HomeBaseCard } from "@/components/trip/home-base-card";

describe("HomeBaseCard", () => {
  it("shows the home base name and links to trip settings", () => {
    render(<HomeBaseCard tripId="t1" name="Sydney" countryCode="au" variant="origin" />);
    expect(screen.getByText("Sydney")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips/t1/settings");
  });

  it("labels the origin and return variants distinctly", () => {
    const { rerender } = render(<HomeBaseCard tripId="t1" name="Sydney" variant="origin" />);
    expect(screen.getByText(/Trip starts here/i)).toBeInTheDocument();
    rerender(<HomeBaseCard tripId="t1" name="Sydney" variant="return" />);
    expect(screen.getByText(/Trip ends here/i)).toBeInTheDocument();
  });

  it("shows the country code chip when provided", () => {
    render(<HomeBaseCard tripId="t1" name="Sydney" countryCode="au" variant="origin" />);
    expect(screen.getByText("au")).toBeInTheDocument();
  });
});
