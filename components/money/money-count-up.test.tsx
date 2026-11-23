import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MotionProvider } from "@/components/ui/motion-provider";
import { MoneyEntrance } from "./money-entrance";
import { MoneyCountUp } from "./money-count-up";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduced.current }));

const ui = (
  <MotionProvider>
    <MoneyEntrance tripId="t-width">
      <MoneyCountUp minor={1482080} currency="AUD" tripId="t-width" />
    </MoneyEntrance>
  </MotionProvider>
);

const sizer = (c: ParentNode) => c.querySelector("[data-count-sizer]") as HTMLElement;
const counting = (c: ParentNode) => c.querySelector("[data-count-whole]") as HTMLElement;

beforeEach(() => {
  sessionStorage.clear();
  reduced.current = false;
});

describe("MoneyCountUp width", () => {
  it("renders an invisible copy of the final whole amount in the same box as the counting digits, from the server render", () => {
    const html = renderToString(ui);
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(sizer(host).dataset.countSizer).toBe("$14,820");
    expect(sizer(host).className).toContain("invisible");
    expect(sizer(host).getAttribute("aria-hidden")).toBe("true");
    expect(sizer(host).parentElement).toBe(counting(host).parentElement);
    expect(sizer(host).parentElement!.className).toContain("inline-grid");
  });

  it("keeps the sizer on the final value while the digits count up", async () => {
    const { container } = render(ui);
    await new Promise((r) => setTimeout(r, 60));
    expect(counting(container).textContent).not.toBe("$14,820");
    expect(sizer(container).dataset.countSizer).toBe("$14,820");
  });

  it("under reduced motion shows the final value at once", async () => {
    reduced.current = true;
    const { container } = render(ui);
    await new Promise((r) => setTimeout(r, 30));
    expect(counting(container).textContent).toBe("$14,820");
    expect(sizer(container).dataset.countSizer).toBe("$14,820");
  });
});
