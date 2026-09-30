import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyRow } from "./currency-row";

describe("CurrencyRow", () => {
  it("shows the code, the full name and the note", () => {
    render(<CurrencyRow value="AUD" onChange={vi.fn()} note="Picked from Sydney. Costs in other currencies convert to this." />);
    expect(screen.getByText("Show money in")).toBeInTheDocument();
    expect(screen.getByText("AUD")).toBeInTheDocument();
    expect(screen.getByText("Australian Dollar")).toBeInTheDocument();
    expect(screen.getByText(/Picked from Sydney/)).toBeInTheDocument();
  });

  it("Change opens a searchable list; choosing one calls onChange and closes", async () => {
    const onChange = vi.fn();
    render(<CurrencyRow value="AUD" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Change currency/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search currencies" }), "yen");
    expect(screen.queryByRole("button", { name: /USD/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /JPY/ }));
    expect(onChange).toHaveBeenCalledWith("JPY");
    expect(screen.queryByRole("textbox", { name: "Search currencies" })).toBeNull();
  });

  it("Enter in the search picks the first match without submitting a surrounding form", async () => {
    const onChange = vi.fn();
    const submitted = vi.fn();
    render(<form onSubmit={(e) => { e.preventDefault(); submitted(); }}><CurrencyRow value="AUD" onChange={onChange} /></form>);
    await userEvent.click(screen.getByRole("button", { name: /Change currency/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search currencies" }), "euro{Enter}");
    expect(onChange).toHaveBeenCalledWith("EUR");
    expect(submitted).not.toHaveBeenCalled();
  });
});
