import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepCover } from "./step-cover";
import { StepHarness } from "./step-harness.test-utils";

const file = () => new File(["x"], "cover.png", { type: "image/png" });

function renderCover(over: { initial?: Parameters<typeof StepHarness>[0]["initial"]; cover?: { url: string } | null; onCover?: (f: File | null) => void; onEdit?: (s: 1 | 2 | 3 | 4) => void; errors?: { form?: string } } = {}) {
  const onCover = over.onCover ?? vi.fn();
  const onEdit = over.onEdit ?? vi.fn();
  render(<StepHarness Step={StepCover} initial={over.initial} errors={over.errors} extra={{ cover: over.cover ?? null, onCover, onEdit }} />);
  return { onCover, onEdit };
}

describe("StepCover", () => {
  it("offers the polaroid dropzone with an image-only file input", () => {
    renderCover();
    expect(screen.getByRole("heading", { level: 2, name: "Got a photo for it?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop a photo/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Cover photo")).toHaveAttribute("accept", "image/*");
  });

  it("choosing or dropping a photo hands it up", async () => {
    const { onCover } = renderCover();
    const f = file();
    await userEvent.upload(screen.getByLabelText("Cover photo"), f);
    expect(onCover).toHaveBeenCalledWith(f);
    fireEvent.drop(screen.getByTestId("cover-dropzone"), { dataTransfer: { files: [f] } });
    expect(onCover).toHaveBeenCalledTimes(2);
  });

  it("with a photo: shows it, with Replace and Remove", async () => {
    const { onCover } = renderCover({ cover: { url: "blob:cover" } });
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", "blob:cover");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onCover).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("the frame straightens under a drag and settles back with a bounce (MOTION N11)", () => {
    renderCover();
    const zone = screen.getByTestId("cover-dropzone");
    expect(zone.className).toMatch(/\btransition-transform\b/);
    expect(zone.className).toMatch(/-rotate-3 .*ease-bounce/);
    fireEvent.dragOver(zone);
    expect(zone.className).toMatch(/rotate-0 scale-\[1\.03\] duration-\[var\(--dur-base\)\] ease-pop/);
    fireEvent.dragLeave(zone);
    expect(zone.className).toMatch(/duration-\[var\(--dur-slow\)\] ease-bounce/);
  });

  it("the chosen photo fades in inside the frame", () => {
    renderCover({ cover: { url: "blob:cover" } });
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveClass("tp-fade-in");
  });

  it("the review lists every step; skipped ones read muted", () => {
    renderCover({ initial: { dateMode: "none" } });
    expect(screen.getByText("Your trip")).toBeInTheDocument();
    expect(screen.getByText("Kyoto")).toBeInTheDocument();
    expect(screen.getByText("No dates yet")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("Home base not set · money in AUD")).toHaveClass("text-muted-foreground");
  });

  it("the review reads answered steps", () => {
    renderCover({ initial: { startDate: "2026-12-04", endDate: "2027-01-08", homeName: "Sydney" } });
    expect(screen.getByText("Fri 4 Dec – Fri 8 Jan · 35 nights")).toBeInTheDocument();
    expect(screen.getByText("Sydney · money in AUD")).toBeInTheDocument();
  });

  it("Edit jumps to that step", async () => {
    const { onEdit } = renderCover();
    await userEvent.click(screen.getByRole("button", { name: "Edit When" }));
    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it("Create trip is the one coral CTA, with the next hint", () => {
    renderCover();
    const cta = screen.getByRole("button", { name: /Create trip/ });
    expect(cta.className).toMatch(/\bbg-coral\b/);
    expect(screen.getByText("Next: add your first stop")).toBeInTheDocument();
  });

  it("past mode: Add trip, a Where row, no hint", () => {
    renderCover({ initial: { past: true, startDate: "2026-08-01", endDate: "2026-08-10", stops: [{ name: "Kyoto" }, { name: "Nara" }] } });
    expect(screen.getByRole("button", { name: /Add trip/ })).toBeInTheDocument();
    expect(screen.getByText("Kyoto, Nara · money in AUD")).toBeInTheDocument();
    expect(screen.queryByText("Next: add your first stop")).toBeNull();
  });

  it("shows a form-level server error", () => {
    renderCover({ errors: { form: "Something went wrong. Try again." } });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });
});
