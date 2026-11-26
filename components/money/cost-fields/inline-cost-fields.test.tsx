import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { InlineCostFields } from "./inline-cost-fields";
import { useCostFields } from "./use-cost-fields";
import { TripCurrenciesProvider } from "@/components/money/trip-currencies-context";
import { emptyCostFormState, type CostFormState } from "@/lib/money/cost-form-state";

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
    paidCurrency: "GBP",
    onPaidCurrencyChange: vi.fn(),
    paidAt: "",
    onPaidAtChange: vi.fn(),
    settlement: "BEFORE",
    onSettlementChange: vi.fn(),
    errors: {},
    ...overrides,
  };
  render(<InlineCostFields {...props} />);
  return props;
}

function inTrip(ui: React.ReactElement) {
  return (
    <TripCurrenciesProvider homeCurrency="AUD" currencies={["AUD", "EUR", "THB"]}>
      {ui}
    </TripCurrenciesProvider>
  );
}

function Harness({ seed }: { seed: CostFormState }) {
  const { fieldProps } = useCostFields(seed);
  return <InlineCostFields hasMultipleCosts={false} errors={{}} {...fieldProps} />;
}

const paidInEur: CostFormState = {
  ...emptyCostFormState("EUR"),
  costAmount: "550",
  paid: true,
  paidAmount: "550",
  paidAt: "2026-10-01",
  paidCurrency: "EUR",
};

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

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

  // The pre-fill moved into the state (setPaid / useCostFields — card 2.I);
  // the fields only report the tick.
  it("reports ticking Paid and leaves the pre-fill to the state", async () => {
    const user = userEvent.setup();
    const props = renderFields();
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    expect(props.onPaidChange).toHaveBeenCalledWith(true);
    expect(props.onPaidAmountChange).not.toHaveBeenCalled();
  });

  it("surfaces the missing-amount error on the paid field", () => {
    renderFields({ paid: true, errors: { paidMinor: ["Enter what you paid"] } });
    expect(screen.getByText("Enter what you paid")).toBeInTheDocument();
  });

  it("offers the Settlement as a choice: paid before you go or on the trip", async () => {
    const user = userEvent.setup();
    const props = renderFields();
    const before = screen.getByRole("radio", { name: "Paid before you go" });
    const onTrip = screen.getByRole("radio", { name: "Paid on the trip" });
    expect(before).toHaveAttribute("aria-checked", "true");
    expect(onTrip).toHaveAttribute("aria-checked", "false");
    await user.click(onTrip);
    expect(props.onSettlementChange).toHaveBeenCalledWith("ON_TRIP");
  });

  it("shows On the trip as chosen when the Settlement is ON_TRIP", () => {
    renderFields({ settlement: "ON_TRIP" });
    expect(screen.getByRole("radio", { name: "Paid on the trip" })).toHaveAttribute("aria-checked", "true");
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
        paidCurrency="GBP"
        onPaidCurrencyChange={vi.fn()}
        paidAt=""
        onPaidAtChange={vi.fn()}
        settlement="BEFORE"
        onSettlementChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InlineCostFields paired (spec 2026-10-05 §D)", () => {
  it("pairs Cost with the Settlement and Paid, and You paid with Date paid, from sm", () => {
    renderFields({ paired: true, paid: true, paidAmount: "340.00", paidAt: "2026-10-01" });
    const costPair = screen.getByLabelText(/^cost amount$/i).closest("[data-pair='cost']");
    expect(costPair).not.toBeNull();
    expect(costPair).toContainElement(screen.getByRole("checkbox", { name: "Paid" }));
    const paidPair = screen.getByLabelText(/you paid amount/i).closest("[data-pair='paid']");
    expect(paidPair).toContainElement(screen.getByLabelText(/date paid/i));
    expect(paidPair!.className).toContain("sm:grid-cols-2");
    expect(paidPair!.className).not.toMatch(/(^|\s)grid-cols-2/);
  });

  it("unpaired (the CostEditor) keeps the flat layout", () => {
    renderFields({ paid: true, paidAmount: "340.00", paidAt: "2026-10-01" });
    expect(document.querySelector("[data-pair]")).toBeNull();
  });
});

describe("InlineCostFields currencies (spec 2026-11-26 §2)", () => {
  it("Cost offers the trip's currencies and More currencies", async () => {
    const user = userEvent.setup();
    render(inTrip(<Harness seed={paidInEur} />));
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    expect(optionNames()).toEqual(["AUD", "EUR", "THB", "More currencies"]);
  });

  it("You paid offers the Cost's currency and Home", async () => {
    const user = userEvent.setup();
    render(inTrip(<Harness seed={paidInEur} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    expect(optionNames()).toEqual(["EUR", "AUD"]);
  });

  it("You paid is plain text when they are the same", () => {
    render(inTrip(<Harness seed={{ ...paidInEur, currency: "AUD", paidCurrency: "AUD" }} />));
    expect(screen.queryByRole("combobox", { name: "You paid currency" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "You paid currency" })).toHaveTextContent("AUD");
  });

  it("changing You paid's currency does not change the Cost's, and clears the amount", async () => {
    const user = userEvent.setup();
    render(inTrip(<Harness seed={paidInEur} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    await user.click(screen.getByRole("option", { name: "AUD" }));
    expect(screen.getByRole("combobox", { name: "You paid currency" })).toHaveTextContent("AUD");
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveTextContent("EUR");
    expect(screen.getByLabelText("Cost amount")).toHaveValue("550");
    expect(screen.getByLabelText("You paid amount")).toHaveValue("");
  });

  it("changing the Cost's currency does not change a Home You paid", async () => {
    const user = userEvent.setup();
    render(inTrip(<Harness seed={paidInEur} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    await user.click(screen.getByRole("option", { name: "AUD" }));
    await user.type(screen.getByLabelText("You paid amount"), "905.12");
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(screen.getByRole("option", { name: "THB" }));
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveTextContent("THB");
    expect(screen.getByRole("combobox", { name: "You paid currency" })).toHaveTextContent("AUD");
    expect(screen.getByLabelText("You paid amount")).toHaveValue("905.12");
  });

  it("You paid follows a change of the Cost's currency when it was never chosen", async () => {
    const user = userEvent.setup();
    render(inTrip(<Harness seed={paidInEur} />));
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(screen.getByRole("option", { name: "THB" }));
    expect(screen.getByRole("combobox", { name: "You paid currency" })).toHaveTextContent("THB");
    expect(screen.getByLabelText("You paid amount")).toHaveValue("550");
  });

  it("an error about the paid currency shows under You paid", () => {
    renderFields({ paid: true, errors: { paidCurrency: ["What you paid can only be in the cost’s currency or your trip’s home currency."] } });
    expect(screen.getByText("What you paid can only be in the cost’s currency or your trip’s home currency.")).toBeInTheDocument();
  });
});
