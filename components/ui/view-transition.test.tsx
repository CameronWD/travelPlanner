import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewTransition, hasNativeViewTransition } from "./view-transition";

describe("ViewTransition", () => {
  it("renders its children (the stable React vitest resolves has no native ViewTransition, so this is the passthrough)", () => {
    render(
      <ViewTransition enter={{ "day-forward": "day-forward", default: "none" }} default="none">
        <p>Day body</p>
      </ViewTransition>,
    );
    expect(screen.getByText("Day body")).toBeInTheDocument();
  });

  it("reports whether the native component was found", () => {
    expect(typeof hasNativeViewTransition).toBe("boolean");
  });
});
