import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CollageCards, PhoneSampleCards, entrance } from "./sample-cards";

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

describe("CollageCards (spec collage §1.3)", () => {
  it("renders nine decorative pieces, each tilted and animated, at uneven delays", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    expect(root).toHaveAttribute("aria-hidden", "true");
    const ps = pieces(root);
    expect(ps).toHaveLength(9);
    for (const p of ps) {
      expect(p.className).toContain("tp-card-in");
      expect(p.style.getPropertyValue("--tp-tilt")).toMatch(/deg$/);
      expect(p.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(p.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt(p.style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
    expect(root.querySelector("button, a, input, [tabindex]")).toBeNull();
  });
  it("carries the agreed content and no stay/hotel wording", () => {
    const { getByTestId } = render(<CollageCards />);
    const t = getByTestId("collage-cards").textContent!;
    for (const s of ["Japan in Autumn", "26", "Zz Machiya near Gion", "Odawara 11:12", "Jess forked", "Tue 14 Oct", "Fushimi Inari", "21°", "¥2,400", "Jess owes you ¥1,200", "Wishlist", "Naoshima", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
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
    expect(root.querySelectorAll("svg.lucide-arrow-right").length).toBeGreaterThan(8);
  });
});
