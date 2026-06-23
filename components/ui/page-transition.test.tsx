import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTransition } from "./page-transition";

describe("PageTransition", () => {
  it("renders its children", () => {
    render(
      <PageTransition>
        <p>Budget screen</p>
      </PageTransition>,
    );
    expect(screen.getByText("Budget screen")).toBeInTheDocument();
  });
});
