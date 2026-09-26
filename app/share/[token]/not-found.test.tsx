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
  it("renders the neutral 'This link isn't working' heading", () => {
    render(<ShareNotFound />);
    expect(
      screen.getByRole("heading", { name: /this link isn't working/i }),
    ).toBeInTheDocument();
  });

  it("never claims the link expired (share links have no expiry)", () => {
    const { container } = render(<ShareNotFound />);
    expect(container.textContent).not.toMatch(/expire/i);
    expect(
      screen.getByText(/it may have been turned off or replaced/i),
    ).toBeInTheDocument();
  });

  it("has a link pointing to /trips (not /)", () => {
    render(<ShareNotFound />);
    const link = screen.getByRole("link", { name: /go to my trips/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/trips");
  });
});
