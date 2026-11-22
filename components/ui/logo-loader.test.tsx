import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogoLoader } from "@/components/ui/logo-loader";

describe("LogoLoader", () => {
  it("is a status with screen-reader text", () => {
    render(<LogoLoader />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("builds the mark from its three paths and the wordmark beneath", () => {
    const { container } = render(<LogoLoader />);
    for (const c of ["tp-build-outline", "tp-build-door", "tp-build-poles", "tp-build-word", "tp-build-dot"]) {
      expect(container.querySelectorAll(`path.${c}`)).toHaveLength(1);
    }
    expect(container.querySelector("path.tp-build-outline")).toHaveAttribute("pathlength", "1");
    expect(container.querySelector("path.tp-build-poles")).toHaveAttribute("pathlength", "1");
    expect(container.querySelector(".tp-build-idle svg path.tp-build-outline")).not.toBeNull();
  });

  it("no longer spins", () => {
    const { container } = render(<LogoLoader />);
    expect(container.innerHTML).not.toContain("animate-spin");
  });
});
