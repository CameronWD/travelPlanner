import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type * as React from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a>,
}));

import { ReviewHistory } from "./review-history";
import type { HistoryRow } from "@/lib/review/view";

const row = (o: Partial<HistoryRow>): HistoryRow => ({
  id: "r1", href: "/trips/xmas/reviews?review=r1" as HistoryRow["href"], kindLabel: "Standard Review", byName: "Cam",
  when: "Sun 18 Oct, 14:05", line: "Two closures to plan around.", status: "DONE", current: false, ...o,
});

describe("ReviewHistory (R10: who, when, kind, summary line)", () => {
  it("lists every Review, each opening its own Findings, marking the one shown", () => {
    render(<ReviewHistory rows={[row({ id: "r2", href: "/trips/xmas/reviews?review=r2" as HistoryRow["href"], kindLabel: "Deep Review", byName: "Xanni", current: true }), row({ line: "Didn't finish", status: "FAILED" })]} />);
    const list = screen.getByRole("list", { name: "History" });
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/trips/xmas/reviews?review=r2", "/trips/xmas/reviews?review=r1"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(links[0]).toHaveTextContent("Deep Review");
    expect(links[0]).toHaveTextContent("by Xanni, Sun 18 Oct, 14:05");
    expect(links[1]).toHaveTextContent("Didn't finish");
  });
});
