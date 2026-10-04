import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import { PlanBody, usePlanBody, useRegisterPlanActions } from "./plan-body";

function Probe({ id }: { id: string }) {
  const b = usePlanBody();
  return (
    <div>
      <span data-testid={`open-${id}`}>{String(b.isOpen(id))}</span>
      <span data-testid={`day-${id}`}>{b.hashDay ?? "none"}</span>
      <button onClick={() => b.toggle(id)}>toggle {id}</button>
      <button onClick={() => b.jumpTo(id)}>jump {id}</button>
      <button onClick={() => b.actions.addStop()}>add</button>
    </div>
  );
}
function Registrar({ onAdd }: { onAdd: () => void }) {
  useRegisterPlanActions({ addStop: onAdd });
  return null;
}
function Claimer({ label, date }: { label: string; date: string }) {
  const b = usePlanBody();
  const [result, setResult] = React.useState("—");
  return <button onClick={() => setResult(String(b.claimHashDay(date)))}>{label}: {result}</button>;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.history.replaceState(null, "", "/trips/t/plan");
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("PlanBody", () => {
  it("starts from initialOpen when there is no hash", () => {
    render(<PlanBody initialOpen={["a"]} today="2026-12-12"><Probe id="a" /><Probe id="b" /></PlanBody>);
    expect(screen.getByTestId("open-a")).toHaveTextContent("true");
    expect(screen.getByTestId("open-b")).toHaveTextContent("false");
  });

  it("toggling writes #open=… with replaceState", async () => {
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("#open=a");
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("");
  });

  it("a hash day= it was handed rides along through toggles", async () => {
    window.history.replaceState(null, "", "/trips/t/plan#open=a&day=2026-12-11");
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Probe id="a" /><Probe id="b" /></PlanBody>);
    await waitFor(() => expect(screen.getByTestId("open-a")).toHaveTextContent("true"));
    await userEvent.click(screen.getByText("toggle b"));
    expect(window.location.hash).toBe("#open=a,b&day=2026-12-11");
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("#open=b&day=2026-12-11");
  });

  it("claimHashDay: true once, for the hash day only — a Changeover day under two Stops scrolls once", async () => {
    window.history.replaceState(null, "", "/trips/t/plan#open=a&day=2026-12-20");
    render(
      <PlanBody initialOpen={[]} today="2026-12-12">
        <Probe id="a" />
        <Claimer label="other day" date="2026-12-21" />
        <Claimer label="first" date="2026-12-20" />
        <Claimer label="second" date="2026-12-20" />
      </PlanBody>,
    );
    await waitFor(() => expect(screen.getByTestId("day-a")).toHaveTextContent("2026-12-20"));
    await userEvent.click(screen.getByText(/^other day/));
    expect(screen.getByText(/^other day/)).toHaveTextContent("other day: false");
    await userEvent.click(screen.getByText(/^first/));
    expect(screen.getByText(/^first/)).toHaveTextContent("first: true");
    await userEvent.click(screen.getByText(/^second/));
    expect(screen.getByText(/^second/)).toHaveTextContent("second: false");
  });

  it("on mount, #open= restores the open set and hands the day over", async () => {
    window.history.replaceState(null, "", "/trips/t/plan#open=b&day=2026-12-20");
    render(<PlanBody initialOpen={["a"]} today="2026-12-12"><Probe id="a" /><Probe id="b" /></PlanBody>);
    await waitFor(() => expect(screen.getByTestId("open-b")).toHaveTextContent("true"));
    expect(screen.getByTestId("open-a")).toHaveTextContent("false");
    expect(screen.getByTestId("day-b")).toHaveTextContent("2026-12-20");
  });

  it("on mount, #stop-<id> opens and rings that stop (desktop row)", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)");
    window.history.replaceState(null, "", "/trips/t/plan#stop-s1");
    render(
      <PlanBody initialOpen={[]} today="2026-12-12">
        <div id="stop-s1" />
        <div id="m-stop-s1" />
        <Probe id="s1" />
      </PlanBody>,
    );
    await waitFor(() => expect(screen.getByTestId("open-s1")).toHaveTextContent("true"));
    await waitFor(() => expect(document.getElementById("stop-s1")).toHaveAttribute("data-highlight", "true"));
    expect(document.getElementById("m-stop-s1")).not.toHaveAttribute("data-highlight");
  });

  it("falls back to the mobile row below lg", async () => {
    setMatchMedia(false);
    window.history.replaceState(null, "", "/trips/t/plan#stop-s1");
    render(<PlanBody initialOpen={[]} today="2026-12-12"><div id="stop-s1" /><div id="m-stop-s1" /></PlanBody>);
    await waitFor(() => expect(document.getElementById("m-stop-s1")).toHaveAttribute("data-highlight", "true"));
  });

  it("jumpTo with reduced motion scrolls, opens and rings at once", async () => {
    setMatchMedia((q) => q.includes("reduce"));
    render(<PlanBody initialOpen={[]} today="2026-12-12"><div id="stop-a" /><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("jump a"));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    expect(screen.getByTestId("open-a")).toHaveTextContent("true");
    expect(document.getElementById("stop-a")).toHaveAttribute("data-highlight", "true");
  });

  it("header buttons reach handlers ItineraryManager registers", async () => {
    const onAdd = vi.fn();
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Registrar onAdd={onAdd} /><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("without a provider everything is inert", async () => {
    render(<Probe id="a" />);
    await act(async () => { await userEvent.click(screen.getByText("toggle a")); });
    expect(screen.getByTestId("open-a")).toHaveTextContent("false");
  });
});
