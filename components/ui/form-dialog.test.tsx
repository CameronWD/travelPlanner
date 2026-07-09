import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { FormDialog } from "./form-dialog";

function Counter({ seed }: { seed: string }) {
  const [value] = React.useState(seed);
  return <div data-testid="seed">{value}</div>;
}

describe("FormDialog", () => {
  it("renders the title and children when open", () => {
    render(
      <FormDialog open onOpenChange={() => {}} title="Add a stop" recordId={null}>
        <Counter seed="new" />
      </FormDialog>,
    );
    expect(screen.getByText("Add a stop")).toBeInTheDocument();
    expect(screen.getByTestId("seed")).toHaveTextContent("new");
  });

  it("remounts children (re-seeding state) when recordId changes", () => {
    const { rerender } = render(
      <FormDialog open onOpenChange={() => {}} title="Edit" recordId="a">
        <Counter seed="a" />
      </FormDialog>,
    );
    expect(screen.getByTestId("seed")).toHaveTextContent("a");

    rerender(
      <FormDialog open onOpenChange={() => {}} title="Edit" recordId="b">
        <Counter seed="b" />
      </FormDialog>,
    );
    expect(screen.getByTestId("seed")).toHaveTextContent("b");
  });
});
