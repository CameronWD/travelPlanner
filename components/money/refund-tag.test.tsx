import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RefundTag } from "./refund-tag";

describe("RefundTag", () => {
  it("renders nothing without a Refund", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: null, refundedAt: null, currency: "AUD" }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("says Refunded once received", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: 5000, refundedAt: new Date("2026-09-10"), currency: "AUD" }} />);
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent(/^Refunded .*50\.00$/);
  });
  it("says refund expected while waiting", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: 5000, refundedAt: null, currency: "AUD" }} />);
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent(/^.*50\.00 refund expected$/);
  });
});
