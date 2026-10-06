import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { m, motion } from "motion/react";
import { MotionProvider } from "./motion-provider";

describe("MotionProvider", () => {
  it("renders m.* children within the LazyMotion + MotionConfig context", () => {
    render(
      <MotionProvider>
        <m.div data-testid="m">hi</m.div>
      </MotionProvider>,
    );
    expect(screen.getByTestId("m")).toHaveTextContent("hi");
  });

  it("is strict: a full motion.* component inside throws (spec 2026-10-06 §Q)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <MotionProvider>
            <motion.div>full bundle</motion.div>
          </MotionProvider>,
        ),
      ).toThrow(/LazyMotion/);
    } finally {
      err.mockRestore();
    }
  });
});
