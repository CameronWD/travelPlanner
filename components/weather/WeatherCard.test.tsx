import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WeatherCard } from "@/components/weather/WeatherCard";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { getWeatherTheme } from "@/lib/weather/theme";
import type { DayWeather } from "@/lib/weather";
import { CARD_WIDTHS, canvasUnits } from "@/lib/weather/scene-math";

function wx(over: Partial<DayWeather> = {}): DayWeather {
  return { source: "forecast", highC: 9, lowC: 5, code: 3, label: "Overcast", precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null, current: null, fetchedAt: 0, stale: false, ...over };
}
const daylight = { sunrise: "08:12", sunset: "16:33", dayLengthMin: 501, polarDay: false, polarNight: false };
const base = { daysOut: 3, isToday: false, monthShort: "Dec", now: () => 2 * 3600 * 1000 };
function card(day: DayWeather | null, size: "regular" | "compact" = "regular", extra: Partial<Parameters<typeof WeatherCard>[0]> = {}, themeIn: Partial<typeof base> = {}) {
  const theme = getWeatherTheme({ ...base, ...themeIn, day })!;
  return render(<WeatherCard size={size} dateLabel="Sat 12 Dec" placeName="Strasbourg" theme={theme} day={day} daylight={daylight} {...extra} />);
}
const article = () => screen.getByRole("region", { name: "Weather" });
const scenes = ([
  ["sunny", wx({ code: 0 })], ["partly", wx({ code: 2 })], ["overcast", wx({ code: 3 })], ["fog", wx({ code: 45 })],
  ["rain", wx({ code: 61 })], ["snow", wx({ code: 73 })], ["storm", wx({ code: 95 })], ["wind", wx({ code: 1, gustsKph: 55 })],
  ["heat", wx({ code: 0, highC: 36 })], ["night", wx({ code: 0, current: { tempC: -2, isDay: false } })],
] as const).map(([key, day]) => [key, day, key === "night"] as const);

describe("WeatherCard — every theme at both sizes (WEATHER_CARD §7, behaviour not snapshots)", () => {
  const themes: Array<[string, DayWeather, string, string]> = [
    ["sunny", wx({ code: 0 }), "bg-wx-sunny", "Sunny"],
    ["partly", wx({ code: 2 }), "bg-wx-partly", "Partly cloudy"],
    ["overcast", wx({ code: 3 }), "bg-wx-overcast", "Overcast"],
    ["fog", wx({ code: 45 }), "bg-wx-fog", "Fog"],
    ["rain", wx({ code: 80, precipProbMax: 70 }), "bg-wx-rain", "Showers"],
    ["snow", wx({ code: 71, snowfallCm: 2 }), "bg-wx-snow", "Light snow"],
    ["storm", wx({ code: 95, precipProbMax: 60 }), "bg-wx-storm", "Storms"],
    ["wind", wx({ code: 1, gustsKph: 55 }), "bg-wx-wind", "Windy"],
    ["heat", wx({ code: 0, highC: 36 }), "bg-wx-heat", "Scorcher"],
  ];
  for (const size of ["regular", "compact"] as const) {
    it.each(themes)(`${size}: %s → fill, scene, condition`, (key, day, fill, condition) => {
      card(day, size);
      const el = article();
      expect(el.className.split(/\s+/)).toContain(fill);
      expect(el.querySelector(`[data-scene="${key}"]`)).toBeTruthy();
      expect(screen.getByText(condition)).toBeInTheDocument();
      expect(el.className).toContain(size === "regular" ? "h-[236px]" : "h-[140px]");
      if (size === "compact") expect(screen.queryByText(/SAT 12 DEC/i)).toBeNull();
      else expect(screen.getByText("Sat 12 Dec · Strasbourg")).toBeInTheDocument();
    });
  }
  it("night: ink fill, paper text, coral shadow, moon scene, '−2° now', no sun on the arc", () => {
    card(wx({ code: 0, current: { tempC: -2, isDay: false } }), "regular", { nowLocal: "21:00" }, { isToday: true });
    const el = article();
    expect(el.className).toContain("bg-wx-night");
    expect(el.className).toContain("text-wx-night-text");
    expect(el.className).toContain("shadow-[5px_5px_0_var(--color-coral)]");
    expect(el.querySelector('[data-scene="night"]')).toBeTruthy();
    expect(screen.getByText("-2°")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
    expect(el.querySelector("[data-daylight-arc]")).toBeTruthy();
    expect(el.querySelector("[data-sun-marker]")).toBeNull();
  });
  it("today in daylight puts the sun on the arc; another day never does", () => {
    card(wx({ code: 3, current: { tempC: 4, isDay: true } }), "regular", { nowLocal: "12:00" }, { isToday: true });
    expect(article().querySelector("[data-sun-marker]")).toBeTruthy();
    cleanup();
    card(wx({ code: 3 }));
    expect(article().querySelector("[data-sun-marker]")).toBeNull();
  });
  it.each(scenes)("%s draws a hidden SVG scene of at least two layers at both sizes", (key, day) => {
    for (const size of ["regular", "compact"] as const) {
      card(day, size, {}, { isToday: key === "night" });
      const scene = article().querySelector<HTMLElement>(`[data-scene="${key}"]`)!;
      expect(scene.getAttribute("aria-hidden")).toBe("true");
      expect(scene.querySelector("svg")).toBeTruthy();
      expect(scene.querySelectorAll("[data-layer]").length).toBeGreaterThanOrEqual(2);
      cleanup();
    }
  });
  it("animates only what the card can show: snow and night stay within their budgets", () => {
    const animated = '.wx-pan, .wx-bob, .wx-fall, .wx-sway, .wx-turn, .wx-breathe, .wx-splash, .wx-flash, .wx-twinkle';
    card(wx({ code: 73 }));
    expect(article().querySelectorAll(animated).length).toBeLessThanOrEqual(60);
    cleanup();
    card(wx({ code: 0, current: { tempC: -2, isDay: false } }), "regular", { nowLocal: "21:00" }, { isToday: true });
    expect(article().querySelectorAll(animated).length).toBeLessThanOrEqual(20);
  });
  it("far snow and stars reach across the widest card at either height", () => {
    const widestUnits = Math.max(canvasUnits("compact", CARD_WIDTHS.compact.widest), canvasUnits("regular", CARD_WIDTHS.regular.widest));
    const xs = (sel: string, read: (el: Element) => number) => [...article().querySelectorAll(sel)].map(read);
    card(wx({ code: 73 }));
    const flakes = xs('[data-layer="far-snow"] g[transform] > circle', (c) => Number(/translate\(([\d.]+)/.exec(c.parentElement!.getAttribute("transform")!)![1]));
    expect(Math.max(...flakes)).toBeGreaterThanOrEqual(widestUnits);
    cleanup();
    card(wx({ code: 0, current: { tempC: -2, isDay: false } }), "regular", { nowLocal: "21:00" }, { isToday: true });
    const stars = xs('[data-layer="stars"] circle', (c) => Number(c.getAttribute("cx")));
    expect(Math.max(...stars)).toBeGreaterThanOrEqual(widestUnits);
  });
  it("keeps the date and place on one line, so a long place name never pushes the words into the scene", () => {
    card(wx({ code: 73 }), "regular", { placeName: "Llanfairpwllgwyngyll and Holyhead Ferry Terminal" });
    expect(screen.getByText(/Sat 12 Dec · Llanfairpwllgwyngyll/)).toHaveClass("truncate");
  });
  it("keeps the condition and its chip on one line, so a long condition cannot push the daylight label out of the card", () => {
    card(wx({ code: 73 }), "compact");
    const condition = article().querySelector<HTMLElement>("p.items-center > span")!;
    expect(condition).toHaveClass("truncate", "min-w-0");
    expect(condition.parentElement!.className).not.toMatch(/flex-wrap/);
  });
  it("rain leans with the day's gusts", () => {
    card(wx({ code: 61, gustsKph: 60 }));
    expect(article().querySelector<HTMLElement>('[data-scene="rain"]')!.style.getPropertyValue("--wx-rain-angle")).toBe("30deg");
    cleanup();
    card(wx({ code: 61, gustsKph: null }));
    expect(article().querySelector<HTMLElement>('[data-scene="rain"]')!.style.getPropertyValue("--wx-rain-angle")).toBe("0deg");
  });
  it("an evening card today takes the night sky bands", () => {
    card(wx({ code: 3, current: { tempC: 4, isDay: false } }), "regular", { nowLocal: "19:00" }, { isToday: true });
    const top = article().querySelector("[data-layer=\"sky\"] rect")!;
    expect(top.getAttribute("fill")).toBe("hsl(var(--wx-cloud-storm))");
  });
  it("shows exactly one chip, or none", () => {
    card(wx({ code: 80, precipProbMax: 70 }));
    expect(screen.getAllByTestId("wx-chip")).toHaveLength(1);
    expect(screen.getByTestId("wx-chip")).toHaveTextContent("Rain 70%");
    cleanup();
    card(wx({ code: 0, uvMax: 3 }));
    expect(screen.queryAllByTestId("wx-chip").filter((c) => c.textContent === "")).toHaveLength(0);
  });
  it("offline: keeps the fill, drops the scene, ink chip top right", () => {
    card(wx({ code: 3, stale: true }));
    const el = article();
    expect(el.className).toContain("bg-wx-overcast");
    expect(el.querySelector("[data-scene]")).toBeNull();
    expect(screen.getByTestId("wx-offline")).toHaveTextContent("Offline · updated 2h ago");
  });
  it("too far out: dashed paper card, no shadow, 'Too far out' copy with the date, daylight chip", () => {
    card(null, "regular", { forecastOpensOn: "Fri 18 Dec" }, { daysOut: 40 });
    const el = article();
    expect(el.className).toContain("border-dashed");
    expect(el.className).not.toMatch(/shadow-hard/);
    expect(el.querySelector("[data-scene]")).toBeNull();
    expect(screen.getByText(/Too far out for a forecast\. The real forecast starts on Fri 18 Dec, 15 days before\./)).toBeInTheDocument();
    expect(screen.getByText("↑ 08:12 · 16:33 ↓")).toBeInTheDocument();
  });
  it("no forecast: the normal footprint with daylight and the words, no dashes and no scene", () => {
    for (const size of ["regular", "compact"] as const) {
      const { container } = card(null, size, {}, { daysOut: 5 });
      const el = article();
      expect(el.className).toContain(size === "regular" ? "h-[236px]" : "h-[140px]");
      expect(el.querySelector("[data-scene]")).toBeNull();
      const heading = screen.getByText("No forecast right now");
      expect(heading.className).toContain(size === "regular" ? "text-[20px]" : "text-[17px]");
      expect(heading.className).not.toMatch(/text-\[(40|26|44|60)px\]/);
      expect(container.textContent).not.toContain("—");
      expect(container.textContent).not.toContain("Overcast");
      expect(screen.getByText(/08:12/)).toBeInTheDocument();
      cleanup();
    }
  });
  it("high/low read as one accessible phrase", () => {
    card(wx({ code: 3 }));
    expect(screen.getByText("9°")).toBeInTheDocument();
    expect(screen.getByText("/ 5°")).toBeInTheDocument();
    expect(screen.getByText("High 9 degrees, low 5 degrees")).toHaveClass("sr-only");
  });
  it("skeleton has the same sizes and the pulse", () => {
    const { container } = render(<WeatherCardSkeleton size="regular" />);
    expect(container.firstElementChild!.className).toContain("h-[236px]");
    expect(container.querySelector(".tp-pulse")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading weather" })).toBeInTheDocument();
  });
});
