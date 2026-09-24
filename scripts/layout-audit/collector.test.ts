import { describe, expect, it } from "vitest";
import { COLLECTOR_SCRIPT } from "./collector";

describe("COLLECTOR_SCRIPT", () => {
  it("is a self-invoking expression string", () => {
    expect(typeof COLLECTOR_SCRIPT).toBe("string");
    expect(COLLECTOR_SCRIPT).not.toMatch(/__name/);
  });
  it("runs in a DOM and returns every RawCollect key", () => {
    document.body.innerHTML = `<main><p>Hello there</p><button>Go</button></main>`;
    HTMLCanvasElement.prototype.getContext = (() => ({ measureText: () => ({ width: 864 }), font: "" })) as never;
    window.scrollTo = () => {};
    const result = (0, eval)(COLLECTOR_SCRIPT);
    for (const k of ["viewport", "doc", "elementCount", "widest", "spills", "clipped", "boxes", "targets", "chrome", "lines"]) {
      expect(result).toHaveProperty(k);
    }
    expect(Array.isArray(result.boxes)).toBe(true);
  });
});
