import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RefundTag } from "./refund-tag";

const PAID = new Date("2026-09-01");

describe("RefundTag", () => {
  it("renders nothing without a Refund", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: null, refundedAt: null, paidAt: PAID, currency: "AUD" }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("says Refunded once received on a paid Cost", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: 5000, refundedAt: new Date("2026-09-10"), paidAt: PAID, currency: "AUD" }} />);
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent(/^Refunded .*50\.00$/);
  });
  it("says refund expected while waiting", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: 5000, refundedAt: null, paidAt: PAID, currency: "AUD" }} />);
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent(/^.*50\.00 refund expected$/);
  });
  it("shows no Refunded tag when the Refund does not count because the Cost is not paid", () => {
    const { container } = render(<RefundTag cost={{ refundMinor: 5000, refundedAt: new Date("2026-09-10"), paidAt: null, currency: "AUD" }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("formats with the formatter it is given", () => {
    const { container } = render(
      <RefundTag cost={{ refundMinor: 5000, refundedAt: null, paidAt: PAID, currency: "AUD" }} format={(m, c) => `${c}${m / 100}`} />,
    );
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent("AUD50 refund expected");
  });
});

describe("RefundTag paid currency", () => {
  it("a Refund on a Cost paid in Home reads in Home", () => {
    const { container } = render(
      <RefundTag cost={{ refundMinor: 5000, refundedAt: null, paidAt: PAID, currency: "EUR", paidCurrency: "AUD" }} format={(m, c) => `${c}${m / 100}`} />,
    );
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent("AUD50 refund expected");
  });
});
