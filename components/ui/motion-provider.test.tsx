import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { motion } from "motion/react";
import { MotionProvider } from "./motion-provider";

describe("MotionProvider", () => {
  it("renders children within the MotionConfig context", () => {
    render(
      <MotionProvider>
        <motion.div data-testid="m">hi</motion.div>
      </MotionProvider>,
    );
    expect(screen.getByTestId("m")).toBeInTheDocument();
    expect(screen.getByTestId("m")).toHaveTextContent("hi");
  });
});
