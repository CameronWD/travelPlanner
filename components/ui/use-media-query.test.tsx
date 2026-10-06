import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { LG_UP, useMediaQuery } from "./use-media-query";
import { setMatchMedia } from "@/test/setup";

afterEach(() => setMatchMedia((q) => q === "(min-width: 640px)"));

function Probe({ query }: { query: string }) {
  const v = useMediaQuery(query);
  return <span>{v === null ? "null" : String(v)}</span>;
}

describe("useMediaQuery (spec 2026-10-06 §D)", () => {
  it("is null in the server render — there is no viewport there", () => {
    expect(renderToString(<Probe query={LG_UP} />)).toContain("null");
  });

  it("reads matchMedia on the client", () => {
    setMatchMedia((q) => q === LG_UP);
    expect(renderHook(() => useMediaQuery(LG_UP)).result.current).toBe(true);
    setMatchMedia(false);
    expect(renderHook(() => useMediaQuery(LG_UP)).result.current).toBe(false);
  });
});
