import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { CollageCards, PhoneSampleCards, entrance } from "./sample-cards";
import { AUTO_ROTATE_MS, TAP_COOLDOWN_MS } from "./use-trip-shuffle";

describe("entrance()", () => {
  it("sets tilt and index, and an explicit delay only when given", () => {
    const a = entrance(-5, 0) as Record<string, unknown>;
    expect(a["--tp-tilt"]).toBe("-5deg");
    expect(a["--tp-i"]).toBe(0);
    expect(a["--tp-delay"]).toBeUndefined();
    const b = entrance(3, 1, 520) as Record<string, unknown>;
    expect(b["--tp-delay"]).toBe("520ms");
  });
});

function pieces(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-piece]"));
}

describe("CollageCards (handoff LANDING.md §3)", () => {
  it("renders a panel-filling wrapper carrying the scale ladder, a 600×630 stage that scales from it, and nine pieces (spec 2026-10-01 §E)", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    expect(root).not.toHaveAttribute("aria-hidden");
    for (const c of ["absolute", "inset-0", "[--fan-scale:.9]", "min-[1152px]:[--fan-scale:.95]", "min-[1280px]:[--fan-scale:1]", "min-[1536px]:[--fan-scale:1.1]", "min-[1920px]:[--fan-scale:1.3]", "min-[2560px]:[--fan-scale:1.75]"]) {
      expect(root.className).toContain(c);
    }
    expect(root.className).not.toMatch(/(^|\s)scale-\[/);
    const stage = root.querySelector<HTMLElement>('[data-slot="fan-stage"]')!;
    for (const c of ["absolute", "left-1/2", "top-1/2", "h-[630px]", "w-[600px]", "-translate-x-1/2", "-translate-y-1/2", "scale-(--fan-scale)"]) {
      expect(stage.className).toContain(c);
    }
    expect(stage.className).not.toMatch(/scale-\[|min-\[\d+px\]:scale/);
    expect(pieces(root).map((p) => p.dataset.piece)).toEqual(["day", "money", "lilac", "weather", "countdown", "train", "fork", "wishlist", "stops"]);
    // Eight pieces live on the scaled stage; the ribbon is the wrapper's last child, anchored to the panel.
    expect(pieces(stage).map((p) => p.dataset.piece)).toEqual(["day", "money", "lilac", "weather", "countdown", "train", "fork", "wishlist"]);
    const by = (n: string) => root.querySelector<HTMLElement>(`[data-piece="${n}"]`)!;
    expect(by("stops").parentElement).toBe(root);
    expect(root.lastElementChild).toBe(by("stops"));
    for (const c of ["absolute", "-inset-x-10", "top-[calc(50%+259px*var(--fan-scale))]"]) expect(by("stops").className).toContain(c);
    expect(by("stops").className).not.toContain("top-[574px]");
    for (const c of ["left-10", "top-[18px]", "w-[210px]"]) expect(by("day").className).toContain(c);
    for (const c of ["right-10", "top-[18px]", "w-[210px]"]) expect(by("money").className).toContain(c);
    for (const c of ["left-3", "top-[196px]", "w-[170px]"]) expect(by("lilac").className).toContain(c);
    for (const c of ["right-3", "top-[196px]", "w-[170px]"]) expect(by("weather").className).toContain(c);
    for (const c of ["left-[170px]", "top-[150px]", "z-20", "w-[260px]"]) expect(by("countdown").className).toContain(c);
    for (const c of ["inset-x-0", "top-[360px]", "z-30", "justify-center", "pointer-events-none"]) expect(by("train").className).toContain(c);
    for (const c of ["left-[70px]", "top-[418px]", "w-[180px]"]) expect(by("fork").className).toContain(c);
    for (const c of ["right-[70px]", "top-[418px]", "w-[190px]"]) expect(by("wishlist").className).toContain(c);
    // colours cross over: lilac/teal in the middle row, teal/lilac in the bottom row
    expect(by("lilac").firstElementChild!.className).toContain("bg-lilac");
    expect(by("weather").firstElementChild!.className).toContain("bg-teal");
    expect(by("fork").firstElementChild!.className).toContain("bg-teal");
    expect(by("wishlist").firstElementChild!.className).toContain("bg-lilac");
  });
  it("each piece is a wrapper around a tp-card-in card with the mock's tilt and uneven delays (§5.1)", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    const ps = pieces(root);
    const tilts: Record<string, string> = { day: "-8deg", money: "8deg", lilac: "-5deg", weather: "5deg", countdown: "0deg", train: "-4deg", fork: "6deg", wishlist: "-6deg", stops: "0deg" };
    for (const p of ps) {
      expect(p.className).toContain("absolute");
      expect(p.className).not.toContain("tp-card-in");
      const card = p.firstElementChild as HTMLElement;
      expect(card.className).toContain("tp-card-in");
      expect(card.style.getPropertyValue("--tp-tilt")).toBe(tilts[p.dataset.piece!]);
      expect(card.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(card.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt((p.firstElementChild as HTMLElement).style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
    const track = root.querySelector<HTMLElement>('[data-piece="stops"] .tp-marquee')!;
    expect(track.className).toContain("[--tp-marquee-dur:30s]");
    expect(track.children).toHaveLength(2);
    expect(track.children[0].querySelectorAll("span.bg-coral")).toHaveLength(12); // four stops, three repeats per half
  });
  it("carries the Japan copy from sample-trips with lucide glyphs and no stay/hotel wording", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    const t = root.textContent!;
    for (const s of ["Planning", "Japan in Autumn", "26", "sleeps", "to go", "Kyoto · 4 nights", "Machiya near Gion", "paid", "Kyoto", "21°", "light jacket tonight", "Shinkansen · 11:12", "Tue 14 Oct", "09:00", "Fushimi Inari", "Nishiki lunch", "Pontochō", "Ramen at Ichiran", "¥2,400", "Jess owes you ¥1,200", "JM", "AL", "Jess forked", "“Slow Kyoto”", "Wishlist", "Naoshima art island", "2", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/→|♡|☀|☁|↻|✓/);
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying|Odawara|Zz /i);
    expect(root.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(root.querySelector("svg.lucide-check")).not.toBeNull();
    expect(root.querySelector("svg.lucide-heart")).not.toBeNull();
    expect(root.querySelector("svg.lucide-refresh-cw")).not.toBeNull();
  });
});

describe("PhoneSampleCards (handoff LANDING.md §2.2–2.3)", () => {
  it("renders five pieces in a clipped, centred area around a fixed 268px stage", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    expect(root).not.toHaveAttribute("aria-hidden");
    for (const c of ["overflow-hidden", "flex-1", "min-h-0", "items-center", "justify-center", "-mx-6", "self-stretch", "text-left"]) {
      expect(root.className).toContain(c);
    }
    const stage = root.firstElementChild as HTMLElement;
    expect(stage.className).toContain("h-[268px]");
    expect(stage.className).toContain("max-w-[393px]");
    expect(pieces(root).map((p) => p.dataset.piece)).toEqual(["lilac", "weather", "countdown", "train", "stops"]);
  });
  it("each piece is a positioned wrapper around a tp-card-in card with a tilt and uneven delays (§5.1)", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const ps = pieces(getByTestId("sample-cards-phone"));
    for (const p of ps) {
      expect(p.className).toContain("absolute");
      expect(p.className).not.toContain("tp-card-in");
      const card = p.firstElementChild as HTMLElement;
      expect(card.className).toContain("tp-card-in");
      expect(card.style.getPropertyValue("--tp-tilt")).toMatch(/deg$/);
      expect(card.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(card.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt((p.firstElementChild as HTMLElement).style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
  });
  it("lays the fan out symmetrically with the narrow-phone variant, the front card untilted and the chip inert", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    const by = (n: string) => root.querySelector<HTMLElement>(`[data-piece="${n}"]`)!;
    for (const c of ["left-3.5", "top-[34px]", "w-[116px]", "max-[379px]:w-[104px]"]) expect(by("lilac").className).toContain(c);
    for (const c of ["right-3.5", "top-[34px]", "w-[116px]", "max-[379px]:w-[104px]"]) expect(by("weather").className).toContain(c);
    for (const c of ["left-1/2", "-ml-[90px]", "top-2.5", "z-20", "w-[180px]", "max-[379px]:w-[168px]", "max-[379px]:-ml-[84px]"]) expect(by("countdown").className).toContain(c);
    for (const c of ["inset-x-0", "top-[166px]", "z-30", "justify-center", "pointer-events-none"]) expect(by("train").className).toContain(c);
    for (const c of ["-inset-x-3", "top-[216px]"]) expect(by("stops").className).toContain(c);
    expect((by("countdown").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("0deg");
    expect((by("lilac").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("-7deg");
    expect((by("weather").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("7deg");
    expect((by("train").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("-4deg");
    const band = by("stops").firstElementChild as HTMLElement;
    for (const c of ["border-y-2", "bg-card", "py-2.5", "overflow-hidden"]) expect(band.className).toContain(c);
    const track = band.firstElementChild as HTMLElement;
    expect(track.className).toContain("tp-marquee");
    expect(track.className).toContain("[--tp-marquee-dur:22s]");
    expect(track.children).toHaveLength(2);
    expect(track.children[0].querySelectorAll("span.bg-coral")).toHaveLength(8); // four stops twice per half
  });
  it("carries the Japan copy from sample-trips with lucide glyphs — no unicode arrows, hearts or suns, no stay/hotel", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    const t = root.textContent!;
    for (const s of ["Planning", "Japan in Autumn", "26", "sleeps", "to go", "Kyoto · 4 nights", "Machiya near Gion", "Kyoto", "21°", "light jacket tonight", "Shinkansen · 11:12", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/→|♡|☀|☁|↻|✓/);
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying|free for up to/i);
    expect(t).not.toMatch(/Fushimi Inari|Jess forked|¥2,400|Naoshima|let's go/); // dropped from phone
    expect(root.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(root.querySelector("svg.lucide-refresh-cw")).not.toBeNull();
    // The ribbon has no arrows (spec 2026-10-01 §D); the one left is the front card's CTA.
    expect(root.querySelectorAll("svg.lucide-arrow-right").length).toBe(1);
  });
});

describe("Card fan accessibility (handoff LANDING.md §6)", () => {
  it.each([
    ["phone", () => render(<PhoneSampleCards />).getByTestId("sample-cards-phone")],
    ["desktop", () => render(<CollageCards />).getByTestId("collage-cards")],
  ])("%s: the front card is the only focusable element, a pressable button named 'Show another sample trip' whose content is aria-hidden", (_, mount) => {
    const root = mount();
    expect(root).not.toHaveAttribute("aria-hidden");
    const focusable = root.querySelectorAll("button, a, input, [tabindex]");
    expect(focusable).toHaveLength(1);
    const button = within(root).getByRole("button", { name: "Show another sample trip" });
    expect(button).toBe(focusable[0]);
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("pressable");
    expect(button.className).toContain("tp-card-in");
    expect(button.className).toContain("bg-coral");
    expect(button.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(button.closest("[data-piece]")).toHaveAttribute("data-piece", "countdown");
    expect(button.closest("[data-piece]")).not.toHaveAttribute("aria-hidden");
    for (const p of pieces(root)) {
      if (p.dataset.piece !== "countdown") expect(p).toHaveAttribute("aria-hidden", "true");
    }
    expect(root.querySelector("[aria-live], [role='status']")).toBeNull();
  });
});

describe("Card fan shuffle (handoff LANDING.md §5, §7)", () => {
  beforeEach(() => {
    Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation) as unknown as typeof Element.prototype.animate;
    Element.prototype.getAnimations = vi.fn(() => []) as unknown as typeof Element.prototype.getAnimations;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setMatchMedia((q) => q === "(min-width: 640px)");
  });
  const tap = async (root: HTMLElement) => {
    await act(async () => { fireEvent.click(within(root).getByRole("button", { name: "Show another sample trip" })); });
    await act(async () => {});
  };

  it("phone: clicking the front card shows Portugal by rail", async () => {
    const root = render(<PhoneSampleCards />).getByTestId("sample-cards-phone");
    await tap(root);
    expect(root.textContent).toContain("Portugal by rail");
    expect(root.textContent).toContain("Alfa Pendular · 09:39");
    expect(root.textContent).not.toContain("Japan in Autumn");
    expect(root.querySelector("svg.lucide-cloud")).not.toBeNull();
  });
  it("desktop: clicking the front card shows Portugal by rail on every piece", async () => {
    const root = render(<CollageCards />).getByTestId("collage-cards");
    await tap(root);
    for (const s of ["Portugal by rail", "Porto · 3 nights", "Flat on the Ribeira", "18°", "Sat 9 May", "Livraria Lello", "€9.60", "Sam added", "Surf lesson in Ericeira", "Lisbon", "Coimbra"]) {
      expect(root.textContent).toContain(s);
    }
  });
  it("the two trees rotate independently", async () => {
    render(<><PhoneSampleCards /><CollageCards /></>);
    const phone = screen.getByTestId("sample-cards-phone");
    const desktop = screen.getByTestId("collage-cards");
    await tap(phone);
    expect(phone.textContent).toContain("Portugal by rail");
    expect(desktop.textContent).toContain("Japan in Autumn");
  });
  it("auto-rotates after 8s, but not within 16s of a click", async () => {
    vi.useFakeTimers();
    const root = render(<PhoneSampleCards />).getByTestId("sample-cards-phone");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await act(async () => {});
    expect(root.textContent).toContain("Portugal by rail");
    await tap(root);
    expect(root.textContent).toContain("Patagonia loop");
    act(() => { vi.advanceTimersByTime(TAP_COOLDOWN_MS); });
    await act(async () => {});
    expect(root.textContent).toContain("Patagonia loop");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await act(async () => {});
    expect(root.textContent).toContain("Lakes weekend");
  });
  it("under reduced motion there is no interval and a click swaps the trip at once", async () => {
    setMatchMedia((q) => q === "(prefers-reduced-motion: reduce)");
    const setInterval = vi.spyOn(window, "setInterval");
    const root = render(<CollageCards />).getByTestId("collage-cards");
    await act(async () => { fireEvent.click(within(root).getByRole("button", { name: "Show another sample trip" })); });
    expect(root.textContent).toContain("Portugal by rail");
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
  });
  it.each([
    ["phone", () => render(<PhoneSampleCards />).getByTestId("sample-cards-phone"), 8],
    ["desktop", () => render(<CollageCards />).getByTestId("collage-cards"), 12],
  ])("%s: the two ribbon halves have identical text", (_, mount, perHalf) => {
    const root = mount();
    const halves = root.querySelectorAll<HTMLElement>("[data-ribbon-half]");
    expect(halves).toHaveLength(2);
    expect(halves[0].textContent).toBe(halves[1].textContent);
    expect(halves[0].querySelectorAll("span.bg-coral")).toHaveLength(perHalf);
    expect(halves[0].textContent).toContain("Tokyo");
  });
});

describe("Route ribbon has no arrows (spec 2026-10-01 §D)", () => {
  it.each([
    ["phone", () => render(<PhoneSampleCards />).getByTestId("sample-cards-phone")],
    ["desktop", () => render(<CollageCards />).getByTestId("collage-cards")],
  ])("%s: a leftward ticker carries no right-pointing arrows; the dots and names remain", (_, mount) => {
    const root = mount();
    const halves = root.querySelectorAll<HTMLElement>("[data-ribbon-half]");
    expect(halves.length).toBe(2);
    for (const half of halves) {
      expect(half.querySelector("svg.lucide-arrow-right")).toBeNull();
      expect(half.querySelectorAll(".bg-coral.rounded-full").length).toBeGreaterThan(0);
      expect(half.textContent).toContain("Kyoto");
    }
  });
});
