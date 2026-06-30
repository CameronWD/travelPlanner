import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ShareNotFound from "./not-found";

// Link from next/link renders an <a> in test environments
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("ShareNotFound", () => {
  it("renders the 'Link not found' heading", () => {
    render(<ShareNotFound />);
    expect(
      screen.getByRole("heading", { name: /link not found/i }),
    ).toBeInTheDocument();
  });

  it("has a link pointing to /trips (not /)", () => {
    render(<ShareNotFound />);
    const link = screen.getByRole("link", { name: /go to my trips/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/trips");
  });
});
