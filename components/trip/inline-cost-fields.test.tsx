import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineCostFields } from "./inline-cost-fields";

function renderFields(overrides = {}) {
  const props = {
    hasMultipleCosts: false,
    costAmount: "340.00",
    onCostChange: vi.fn(),
    currency: "GBP",
    onCurrencyChange: vi.fn(),
    paid: false,
    onPaidChange: vi.fn(),
    paidAmount: "",
    onPaidAmountChange: vi.fn(),
    paidAt: "",
    onPaidAtChange: vi.fn(),
    errors: {},
    ...overrides,
  };
  render(<InlineCostFields {...props} />);
  return props;
}

describe("InlineCostFields", () => {
  it("labels the cost field 'Cost', not 'Estimated cost'", () => {
    renderFields();
    expect(screen.getByLabelText(/^cost amount$/i)).toBeInTheDocument();
    expect(screen.queryByText(/estimated cost/i)).not.toBeInTheDocument();
  });

  it("hides the paid amount until Paid is ticked", () => {
    renderFields();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();
  });

  it("reveals the paid amount when Paid is ticked", () => {
    renderFields({ paid: true, paidAmount: "340.00" });
    expect(screen.getByLabelText(/you paid amount/i)).toBeInTheDocument();
  });

  it("prefills the paid amount from the cost when Paid is ticked", async () => {
    const user = userEvent.setup();
    const props = renderFields();
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    expect(props.onPaidChange).toHaveBeenCalledWith(true);
    expect(props.onPaidAmountChange).toHaveBeenCalledWith("340.00");
  });

  it("surfaces the missing-amount error on the paid field", () => {
    renderFields({ paid: true, errors: { paidMinor: ["Enter what you paid"] } });
    expect(screen.getByText("Enter what you paid")).toBeInTheDocument();
  });

  it("renders nothing when multiple costs exist", () => {
    const { container } = render(
      <InlineCostFields
        hasMultipleCosts
        costAmount="340.00"
        onCostChange={vi.fn()}
        currency="GBP"
        onCurrencyChange={vi.fn()}
        paid={false}
        onPaidChange={vi.fn()}
        paidAmount=""
        onPaidAmountChange={vi.fn()}
        paidAt=""
        onPaidAtChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
