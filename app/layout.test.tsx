import { describe, it, expect, vi } from "vitest";

// next/font/google runs a Node loader that isn't available in vitest's jsdom
// environment. Mock it minimally so the layout module can be imported.
vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "--font-display-google", className: "" }),
  Plus_Jakarta_Sans: () => ({ variable: "--font-sans-google", className: "" }),
}));

// CSS imports are no-ops in jsdom; vitest handles them but the globals.css
// import triggers PostCSS which isn't wired in the test environment.
vi.mock("./globals.css", () => ({}));

const { viewport, metadata } = await import("./layout");

describe("root layout PWA metadata", () => {
  it("sets viewport-fit=cover so safe-area insets resolve in standalone", () => {
    expect(viewport.viewportFit).toBe("cover");
  });
  it("declares the app as an Apple web app", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "TEEPEE" });
  });
});
