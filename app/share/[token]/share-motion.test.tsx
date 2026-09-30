import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareReveal, PlayOnce } from "./share-reveal";
import { ShareCountdown } from "./share-countdown";
import { PendingLink } from "./pending-link";

beforeEach(() => sessionStorage.clear());

// jsdom has no AnimationEvent, so React listens for the webkit name; fire both.
function animationEnd(el: Element) {
  act(() => {
    for (const type of ["animationend", "webkitAnimationEnd"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

describe("ShareReveal (S1)", () => {
  it("reveals at once without IntersectionObserver (jsdom), carrying its stagger index", () => {
    render(<ShareReveal index={2}><p>Section</p></ShareReveal>);
    const el = screen.getByText("Section").parentElement!;
    expect(el).toHaveAttribute("data-revealed");
    expect(el.style.getPropertyValue("--tp-i")).toBe("2");
  });

  it("drops its entrance class once the rise-in ends, so a display toggle can't replay it", () => {
    render(<ShareReveal><p>Section</p></ShareReveal>);
    const el = screen.getByText("Section").parentElement!;
    expect(el.className).toMatch(/tp-reveal/);
    // A child's animation bubbling up is not the wrapper's own.
    animationEnd(screen.getByText("Section"));
    expect(el.className).toMatch(/tp-reveal/);
    animationEnd(el);
    expect(el.className).not.toMatch(/tp-reveal/);
    expect(el).toHaveAttribute("data-revealed");
  });

  describe("with IntersectionObserver", () => {
    let callback: IntersectionObserverCallback;
    const observe = vi.fn();
    const disconnect = vi.fn();
    beforeEach(() => {
      observe.mockClear();
      disconnect.mockClear();
      vi.stubGlobal(
        "IntersectionObserver",
        vi.fn(function (this: unknown, cb: IntersectionObserverCallback, opts: IntersectionObserverInit) {
          callback = cb;
          expect(opts.threshold).toBe(0.15);
          return { observe, disconnect, unobserve: vi.fn(), takeRecords: vi.fn() };
        }),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("waits for the section to scroll into view, then reveals once and stops observing", () => {
      render(<ShareReveal><p>Section</p></ShareReveal>);
      const el = screen.getByText("Section").parentElement!;
      expect(el).not.toHaveAttribute("data-revealed");
      expect(observe).toHaveBeenCalledWith(el);
      act(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(el).toHaveAttribute("data-revealed");
      expect(disconnect).toHaveBeenCalled();
    });
  });

  it("rise={false} only flags the reveal (the CTA's pop), with no fade-in class", () => {
    render(<ShareReveal rise={false} className="tp-reveal-pop"><p>CTA</p></ShareReveal>);
    const el = screen.getByText("CTA").parentElement!;
    expect(el).toHaveAttribute("data-revealed");
    expect(el.className).not.toMatch(/(^|\s)tp-reveal(\s|$)/);
    expect(el.className).toMatch(/tp-reveal-pop/);
  });
});

describe("PlayOnce", () => {
  it("keeps its entrance class until its own animation ends", () => {
    render(<PlayOnce play="tp-share-polaroid-in" className="rotate-[4deg]" data-share-polaroid="">x</PlayOnce>);
    const el = screen.getByText("x");
    expect(el.className).toMatch(/tp-share-polaroid-in/);
    expect(el).toHaveAttribute("data-share-polaroid");
    animationEnd(el);
    expect(el.className).not.toMatch(/tp-share-polaroid-in/);
    expect(el.className).toMatch(/rotate-\[4deg\]/);
  });
});

describe("ShareCountdown (S4)", () => {
  it("always labels the final value and records that it played for this link", async () => {
    render(<ShareCountdown value={67} refKey="abc123" />);
    expect(screen.getByLabelText("67")).toBeInTheDocument();
    await act(async () => {});
    expect(sessionStorage.getItem("tp-share-count:abc123")).toBe("1");
  });
  it("counts up from 0 the first time", async () => {
    render(<ShareCountdown value={67} refKey="abc123" />);
    // Motion writes the digits on its next frame.
    await waitFor(() => expect(Number(screen.getByLabelText("67").textContent)).toBeLessThan(67));
  });
  it("shows the value straight away when it has already played this session", () => {
    sessionStorage.setItem("tp-share-count:abc123", "1");
    render(<ShareCountdown value={67} refKey="abc123" />);
    expect(screen.getByText("67")).toBeInTheDocument();
  });
  it("shows the value straight away under reduced motion", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      render(<ShareCountdown value={67} refKey="abc123" />);
      await act(async () => {});
      expect(screen.getByText("67")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
  it("still shows the value when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      render(<ShareCountdown value={67} refKey="abc123" />);
      expect(screen.getByLabelText("67")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("PendingLink (S11)", () => {
  it("shows a loading state on click", async () => {
    render(<PendingLink href="/x">Use this route</PendingLink>);
    const link = screen.getByRole("link", { name: "Use this route" });
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(link.querySelector("svg.animate-spin")).not.toBeNull();
  });
  it("a modifier-click (new tab) leaves the button idle", () => {
    render(<PendingLink href="/x">Use this route</PendingLink>);
    const link = screen.getByRole("link", { name: "Use this route" });
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link, { metaKey: true });
    expect(link).not.toHaveAttribute("aria-busy");
  });
  it("coming back from the bfcache clears the loading state", async () => {
    render(<PendingLink href="/x">Use this route</PendingLink>);
    const link = screen.getByRole("link", { name: "Use this route" });
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(link).not.toHaveAttribute("aria-busy");
  });
});
