import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plane } from "lucide-react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/booking-confirmation", () => ({ setNothingToAttach: vi.fn() }));
import { LegCard, LegPill, LegRow } from "./leg-pill";

const FLIGHT = { icon: Plane, label: "Flight CDG → FCO", sub: "Tue 15 Dec 10:05", missing: false, accessibleName: "Flight from Paris to Rome, Tuesday 15 December 10:05. Edit.", arrival: "", detail: "" };
const MISSING = { icon: null, label: "How are you getting to Florence?", sub: "Add", missing: true, accessibleName: "Add transport from Rome to Florence", arrival: "", detail: "" };

describe("LegRow / LegPill (PLAN.md §2)", () => {
  it("a solid connector for legs, dashed otherwise; 52px desktop, 40px compact", () => {
    const { container, rerender } = render(<LegRow kind="legs" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute("data-leg-kind", "legs");
    expect(row.className).toContain("min-h-[52px]");
    expect(row.querySelector("[data-connector]")!.className).not.toMatch(/border-dashed/);
    rerender(<LegRow kind="line" compact />);
    expect((container.firstElementChild as HTMLElement).className).toContain("min-h-10");
    expect(container.querySelector("[data-connector]")!.className).toMatch(/border-dashed/);
  });

  it("a transport pill: icon, label, sub, spoken name, click", async () => {
    const onClick = vi.fn();
    render(<LegPill label={FLIGHT} onClick={onClick} />);
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill).toHaveAttribute("data-travel-row");
    expect(pill.className).toContain("bg-sun/30");
    expect(pill.className).toContain("rounded-2xl");
    expect(pill.className).toContain("tap-target");
    expect(pill.querySelector(".bg-sun")).toBeNull();
    expect(screen.getByText("Tue 15 Dec 10:05").className).toContain("tabular-nums");
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalled();
  });

  it("a stacked row fills its column on a phone and the route label truncates", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} />);
    expect(screen.getByText("Flight CDG → FCO").className).toContain("truncate");
    expect(screen.getByRole("button", { name: FLIGHT.accessibleName }).className).toContain("max-md:w-full");
  });

  it("the when line joins the departure and the arrival", () => {
    render(<LegPill label={{ ...FLIGHT, sub: "Thu 10 Dec 09:28", arrival: "→ 13:05 · 3h 37m" }} onClick={vi.fn()} />);
    expect(document.querySelector('[data-travel-line="when"]')).toHaveTextContent("Thu 10 Dec 09:28 → 13:05 · 3h 37m");
  });

  it("the detail line shows only when there is detail", () => {
    const { rerender } = render(<LegPill label={FLIGHT} onClick={vi.fn()} />);
    expect(document.querySelector('[data-travel-line="detail"]')).toBeNull();
    rerender(<LegPill label={{ ...FLIGHT, detail: "ICE 9572 · QX7P2M" }} onClick={vi.fn()} />);
    expect(document.querySelector('[data-travel-line="detail"]')).toHaveTextContent("ICE 9572 · QX7P2M");
  });

  it("each detail part is its own inline-block so a part moves to the next line whole", () => {
    render(<LegPill label={{ ...FLIGHT, detail: "ICE 9572 · Seat 42" }} onClick={vi.fn()} />);
    const line = document.querySelector('[data-travel-line="detail"]') as HTMLElement;
    const parts = line.querySelectorAll("span.inline-block");
    expect(parts).toHaveLength(2);
    expect(parts[0].textContent).toMatch(/·$/);
    expect(parts[1].textContent).toBe("Seat 42");
    expect(line.className).not.toContain("whitespace-nowrap");
    expect(line.textContent).toBe("ICE 9572 · Seat 42");
  });

  it("the missing pill is dashed on paper with a coral Add", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toMatch(/border-dashed/);
    expect(pill.className).toContain("bg-background");
    expect(pill).not.toHaveAttribute("data-travel-row");
    expect(pill.className).not.toContain("bg-sun");
    expect(screen.getByText("Add").className).toContain("text-coral-text");
  });

  it("compact: 28px, text-xs; the missing one reads + Add transport", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} compact />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toContain("h-7");
    expect(pill.className).toContain("tap-target");
    expect(pill).toHaveTextContent("Add transport");
  });

  it("uses no banned soft classes", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

const TRAIN_A = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Paris to Milano Centrale. Edit.", arrival: "", detail: "" };
const TRAIN_B = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Milano Centrale to Bologna. Edit.", arrival: "", detail: "" };
const TRAIN_C = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Bologna to Rome. Edit.", arrival: "", detail: "" };

describe("LegRow — metro line (spec 2026-10-05 §F)", () => {
  it("a single leg looks as it does now, plus its station dot", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelectorAll("[data-leg-station]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(1);
    expect(container.querySelector("[data-changeover]")).toBeNull();
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill).toHaveAttribute("data-travel-row");
    expect(container.querySelector("[data-station-dot]")).toHaveAttribute("aria-hidden");
  });

  it("three legs stack vertically, one per line, in the order given, each with a dot", () => {
    const { container } = render(
      <LegRow kind="legs">
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
        <LegPill key="c" label={TRAIN_C} onClick={vi.fn()} />
      </LegRow>,
    );
    const stack = container.querySelector("[data-leg-stack]") as HTMLElement;
    expect(stack.className).toContain("flex-col");
    expect(stack.className).not.toContain("flex-wrap");
    const stations = [...container.querySelectorAll("[data-leg-station]")] as HTMLElement[];
    expect(stations.map((s) => within(s).getByRole("button").getAttribute("aria-label"))).toEqual([
      TRAIN_A.accessibleName,
      TRAIN_B.accessibleName,
      TRAIN_C.accessibleName,
    ]);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(3);
  });

  const JOURNEY = "Layover in Bangkok · 2h 35m";
  const journey = (changeovers: (string | null)[], third = false) =>
    render(
      <LegRow kind="legs" changeovers={changeovers}>
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
        {third ? <LegPill key="c" label={TRAIN_C} onClick={vi.fn()} /> : null}
      </LegRow>,
    );

  it("a layover sits on the rail between two flights", () => {
    const { container } = journey([null, JOURNEY]);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-station-stub]")).toHaveLength(2);
    const layover = container.querySelectorAll("[data-layover-dot]");
    expect(layover).toHaveLength(1);
    expect(layover[0]).toHaveAttribute("aria-hidden");
    const [d1, d2] = [...container.querySelectorAll("[data-station-dot]")];
    expect(d1.compareDocumentPosition(layover[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(layover[0].compareDocumentPosition(d2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const pill = container.querySelector("[data-changeover]") as HTMLElement;
    expect(pill.textContent).toBe(JOURNEY);
    expect(pill.querySelector("svg")).toBeNull();
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).not.toContain("hover:");
    expect(container.querySelector("[data-layover-stub]")).not.toBeNull();
  });

  it("separate journeys in one stack sit further apart than the cards of one journey", () => {
    const { container } = journey([null, JOURNEY, null], true);
    const stack = container.querySelector("[data-leg-stack]") as HTMLElement;
    expect(stack.className).toContain("gap-14");
    expect(stack.className).not.toContain("gap-3");
  });

  it("a stack with no joined cards keeps its gap", () => {
    const { container } = journey([null, null]);
    expect((container.querySelector("[data-leg-stack]") as HTMLElement).className).toContain("gap-3");
  });

  it("an unjoined pair has no layover marker", () => {
    const { container } = journey([null, null]);
    expect(container.querySelector("[data-layover-dot]")).toBeNull();
    expect(container.querySelector("[data-changeover]")).toBeNull();
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(2);
  });

  it("a single card is unchanged", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(1);
    expect(container.querySelector("[data-layover-dot]")).toBeNull();
    const run = container.querySelector("[data-leg-run]") as HTMLElement;
    const station = run.querySelector("[data-leg-station]") as HTMLElement;
    const wrapper = station.querySelector("[data-travel-row]")!.parentElement as HTMLElement;
    for (const el of [run, station, wrapper]) {
      expect(el.className.split(" ")).not.toContain("w-fit");
      expect(el.className.split(" ")).not.toContain("w-full");
    }
  });

  it("a long layover label stays on one line, cut short, with the whole label on hover", () => {
    const long = "Layover in Frankfurt am Main Flughafen Fernbahnhof · 2h 35m";
    const { container } = journey([null, long]);
    const pills = container.querySelectorAll("[data-changeover]");
    expect(pills).toHaveLength(1);
    expect((pills[0] as HTMLElement).className.split(" ")).toContain("truncate");
    expect(pills[0]).toHaveAttribute("title", long);
  });

  it("an unjoined card after a journey keeps its own marker and gap", () => {
    const { container } = journey([null, JOURNEY, null], true);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(3);
    const stations = [...container.querySelectorAll("[data-leg-station]")] as HTMLElement[];
    expect(stations[2].querySelector("[data-station-dot]")).not.toBeNull();
    expect(stations[2].closest("[data-leg-run]")).not.toBe(stations[1].closest("[data-leg-run]"));
    expect(stations[0].closest("[data-leg-run]")).toBe(stations[1].closest("[data-leg-run]"));
  });

  it("the cards of a joined run are the same width", () => {
    const { container } = journey([null, JOURNEY, null], true);
    const runs = [...container.querySelectorAll("[data-leg-run]")] as HTMLElement[];
    expect(runs[0].className).toContain("w-fit");
    for (const station of runs[0].querySelectorAll("[data-leg-station]")) {
      expect(station.className).toContain("w-full");
      expect(station.querySelector("[data-travel-row]")!.parentElement!.className).toContain("w-full");
    }
    expect(runs[1].className).not.toContain("w-fit");
    const single = runs[1].querySelector("[data-leg-station]") as HTMLElement;
    expect(single.className.split(" ")).not.toContain("w-full");
  });

  it("the label is read between the two cards", () => {
    const { container } = journey([null, JOURNEY]);
    const nodes = [...container.querySelectorAll("button, [data-changeover]")];
    expect(nodes.map((n) => n.getAttribute("data-changeover") !== null ? "join" : n.getAttribute("aria-label"))).toEqual([
      TRAIN_A.accessibleName,
      "join",
      TRAIN_B.accessibleName,
    ]);
  });

  it("an unknown change-over shows nothing", () => {
    const { container } = render(
      <LegRow kind="legs" changeovers={[null, null]}>
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
      </LegRow>,
    );
    expect(container.querySelector("[data-changeover]")).toBeNull();
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(2);
  });

  it("the mode icon is the marker on the line, centred on the row, with a stub to the row", () => {
    const { container, rerender } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    const dot = container.querySelector("[data-station-dot]") as HTMLElement;
    const stub = container.querySelector("[data-station-stub]") as HTMLElement;
    expect(dot).toHaveAttribute("aria-hidden");
    expect(stub).toHaveAttribute("aria-hidden");
    expect(dot.className).toContain("bg-sun");
    expect(dot.className).toContain("size-8");
    expect(dot.className).toContain("ring-background");
    expect(dot.className).toContain("top-1/2");
    expect(dot.className).toContain("left-[-36px]");
    expect(dot.querySelector("svg")).not.toBeNull();
    expect(stub.className).toContain("bg-border");
    expect(stub.className).toContain("w-5");
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("ml-[35px]");
    expect(screen.getByRole("button", { name: FLIGHT.accessibleName }).querySelector("svg.lucide-plane")).toBeNull();
    rerender(<LegRow kind="legs" compact><LegPill label={FLIGHT} onClick={vi.fn()} compact /></LegRow>);
    const cdot = container.querySelector("[data-station-dot]") as HTMLElement;
    expect(cdot.className).toContain("size-7");
    expect(cdot.className).toContain("left-[-32px]");
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("ml-[31px]");
    expect(container.querySelector("[data-station-stub]")!.className).toContain("w-[18px]");
  });

  it("room around the row: py-5 / gap-3, and py-4 compact", () => {
    const { container, rerender } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelector("[data-leg-stack]")!.className).toMatch(/py-5.*gap-3|gap-3.*py-5/);
    rerender(<LegRow kind="legs" compact><LegPill label={FLIGHT} onClick={vi.fn()} compact /></LegRow>);
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("py-4");
  });

  it("the missing prompt and the bare line get no dot", () => {
    const { container, rerender } = render(<LegRow kind="missing"><LegPill label={MISSING} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelector("[data-station-dot]")).toBeNull();
    expect(container.querySelector("[data-station-stub]")).toBeNull();
    expect(screen.getByRole("button", { name: MISSING.accessibleName })).toBeInTheDocument();
    rerender(<LegRow kind="line" />);
    expect(container.querySelector("[data-leg-stack]")).toBeNull();
  });

  it("a compact pill is bounded by its row and truncates the route label, so a long drive never scrolls the page (spec 2026-10-12 W6)", () => {
    const DRIVE = { ...FLIGHT, label: "Drive Devonport → Launceston", sub: "Tue 22 Sep 08:00", accessibleName: "Drive from Devonport to Launceston, Tuesday 22 September 08:00. Edit." };
    const { container } = render(<LegRow kind="legs" compact><LegPill compact label={DRIVE} onClick={vi.fn()} /></LegRow>);
    const station = container.querySelector("[data-leg-station]") as HTMLElement;
    expect(station.className).toContain("max-w-full");
    expect(station.className).toContain("min-w-0");
    expect((station.firstElementChild as HTMLElement).className).toContain("max-w-full");
    const pill = screen.getByRole("button", { name: DRIVE.accessibleName });
    expect(pill.className).toContain("max-w-full");
    expect(pill.className).toContain("min-w-0");
    expect(pill.className).not.toContain("shrink-0");
    expect(screen.getByText("Drive Devonport → Launceston").className).toContain("truncate");
    expect(screen.getByText("Tue 22 Sep 08:00")).toBeInTheDocument();
  });
});

describe("LegPill Booking state (spec 2026-10-17 R2)", () => {
  it("a To book leg says so on the pill, with its book-by date when set", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="TO_BOOK" bookBy="2027-05-01" />);
    expect(screen.getByRole("button")).toHaveTextContent("Book by 1 May");
  });
  it("the To book badge is text-xs, like the time beside it", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="TO_BOOK" bookBy="2027-05-01" />);
    const badge = screen.getByText("Book by 1 May");
    expect(badge).toHaveClass("text-xs");
    expect(badge).not.toHaveClass("text-[10px]");
  });
  it("a To book leg with no book-by date says To book", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="TO_BOOK" />);
    expect(screen.getByRole("button")).toHaveTextContent("To book");
  });
  it("a Booked leg shows no badge", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="BOOKED" />);
    expect(screen.getByRole("button")).not.toHaveTextContent("To book");
  });

  it("the accessible name speaks To book, not just the visual badge (aria-label overrides name-from-content)", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="TO_BOOK" />);
    expect(screen.getByRole("button", { name: /To book/ })).toBeInTheDocument();
  });

  it("the accessible name speaks the book-by date when set", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="TO_BOOK" bookBy="2027-05-01" />);
    expect(screen.getByRole("button", { name: /Book by 1 May/ })).toBeInTheDocument();
  });

  it("a Booked leg's accessible name is unchanged", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="BOOKED" />);
    expect(screen.getByRole("button", { name: FLIGHT.accessibleName })).toBeInTheDocument();
  });

  it("never shows the missing-confirmation note, booked or not", () => {
    render(<LegPill label={FLIGHT} onClick={vi.fn()} bookingState="BOOKED" />);
    expect(screen.queryByText("No booking confirmation attached")).toBeNull();
    expect(screen.queryByRole("button", { name: "No file needed" })).toBeNull();
  });

  it("renders the pill alone, with no wrapper stacked around it", () => {
    const { container } = render(<LegPill label={FLIGHT} onClick={vi.fn()} />);
    expect(container.firstElementChild).toBe(screen.getByRole("button"));
  });

  describe("a file attached", () => {
    it("shows a paperclip after the label and says File attached in the accessible name", () => {
      render(<LegPill label={FLIGHT} onClick={vi.fn()} attached />);
      const pill = screen.getByRole("button", { name: `${FLIGHT.accessibleName} File attached.` });
      const clip = pill.querySelector("svg.lucide-paperclip")!;
      expect(clip).toHaveAttribute("aria-hidden", "true");
      expect(clip).toHaveClass("size-3.5", "shrink-0", "text-muted-foreground");
      expect(screen.getByText("Flight CDG → FCO").compareDocumentPosition(clip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    it("shows no paperclip and keeps the name when none is attached", () => {
      render(<LegPill label={FLIGHT} onClick={vi.fn()} />);
      expect(screen.getByRole("button", { name: FLIGHT.accessibleName }).querySelector("svg.lucide-paperclip")).toBeNull();
    });
    it("joins the To book wording in the name, and shows on a compact pill too", () => {
      render(<LegPill label={FLIGHT} onClick={vi.fn()} compact attached bookingState="TO_BOOK" />);
      expect(screen.getByRole("button", { name: `${FLIGHT.accessibleName} To book. File attached.` }).querySelector("svg.lucide-paperclip")).not.toBeNull();
    });
  });
});

describe("LegCard", () => {
  const WITH_DETAIL = { ...FLIGHT, arrival: "→ 12:15", detail: "ICE 9572" };

  it("is the pill's card with nothing to press", () => {
    render(<><LegPill label={WITH_DETAIL} onClick={() => {}} compact /><LegCard label={WITH_DETAIL} compact footer={<i>arrives Sat 15:45 your time</i>} /></>);
    const pill = screen.getByRole("button") as HTMLElement;
    const card = document.querySelectorAll("[data-travel-row]")[1] as HTMLElement;
    expect(card.tagName).toBe("DIV");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    for (const c of ["bg-sun/30", "rounded-2xl", "shadow-[3px_3px_0_hsl(var(--sun))]"]) {
      expect(pill.className).toContain(c);
      expect(card.className).toContain(c);
    }
    for (const c of ["pressable", "tap-target", "group", "active:"]) expect(card.className).not.toContain(c);
    expect(card).toHaveTextContent("Flight CDG → FCO");
    expect(card.querySelector("[data-travel-line='when']")).toHaveTextContent("Tue 15 Dec 10:05 → 12:15");
    expect(card.querySelector("[data-travel-line='detail']")).toHaveTextContent("ICE 9572");
    expect(card.querySelector("[data-travel-line='footer']")).toHaveTextContent("arrives Sat 15:45 your time");
  });

  it("gets the marker and stub on the line like a pill", () => {
    const { container } = render(<LegRow kind="legs" compact><LegCard label={FLIGHT} compact /></LegRow>);
    expect(container.querySelector("[data-station-dot]")!.className).toContain("bg-sun");
    expect(container.querySelector("[data-station-stub]")).not.toBeNull();
  });
});

describe("drive line", () => {
  const DRIVE = { ...FLIGHT, label: "Drive Brisbane → Tweed Heads", sub: "Fri 4 Dec 09:00", arrival: "→ 11:00 · 1h" };
  it("a short drive line takes the warning colour", () => {
    const { container } = render(<LegPill label={{ ...DRIVE, drive: { text: "95 km · about 1h 12m driving", tooShort: true } }} onClick={vi.fn()} />);
    const line = container.querySelector('[data-travel-line="drive"]')!;
    expect(line).toHaveTextContent("95 km · about 1h 12m driving");
    expect(line.className).toContain("text-sun-text");
  });
  it("a drive line that fits is muted", () => {
    const { container } = render(<LegPill label={{ ...DRIVE, drive: { text: "95 km · about 1h 12m driving", tooShort: false } }} onClick={vi.fn()} />);
    const line = container.querySelector('[data-travel-line="drive"]')!;
    expect(line.className).toContain("text-muted-foreground");
    expect(line.className).not.toContain("text-sun-text");
  });
  it("a LegCard with no drive renders no drive line", () => {
    const { container } = render(<LegCard label={DRIVE} />);
    expect(container.querySelector('[data-travel-line="drive"]')).toBeNull();
  });
});
