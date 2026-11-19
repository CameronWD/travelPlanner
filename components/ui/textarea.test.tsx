import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { Textarea, submitOnEnter } from "./textarea";

function stubScrollHeight(el: HTMLElement, value: number) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value });
}

describe("Textarea autoGrow", () => {
  it("sets an inline height from its content when the value changes", () => {
    const { rerender } = render(<Textarea autoGrow aria-label="t" value="a" onChange={() => {}} />);
    const el = screen.getByLabelText("t");
    stubScrollHeight(el, 80);
    rerender(<Textarea autoGrow aria-label="t" value="a longer value" onChange={() => {}} />);
    expect(el.style.height).toBe("84px");
  });

  it("sets no inline height without autoGrow", () => {
    const { rerender } = render(<Textarea aria-label="t" value="a" onChange={() => {}} />);
    const el = screen.getByLabelText("t");
    stubScrollHeight(el, 80);
    rerender(<Textarea aria-label="t" value="more" onChange={() => {}} />);
    expect(el.style.height).toBe("");
  });

  it("still forwards its ref", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="t" />);
    expect(ref.current).toBe(screen.getByLabelText("t"));
  });
});

describe("submitOnEnter", () => {
  function setup() {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Textarea aria-label="t" onKeyDown={submitOnEnter} />
      </form>,
    );
    const requestSubmit = vi.fn();
    (screen.getByLabelText("t").closest("form") as HTMLFormElement).requestSubmit = requestSubmit;
    return { requestSubmit, el: screen.getByLabelText("t") };
  }

  it("submits the form on Enter", () => {
    const { requestSubmit, el } = setup();
    fireEvent.keyDown(el, { key: "Enter" });
    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Shift+Enter", () => {
    const { requestSubmit, el } = setup();
    fireEvent.keyDown(el, { key: "Enter", shiftKey: true });
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});
