import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoverDropzone } from "./cover-dropzone";

describe("CoverDropzone (Feedback cmumckjjn000404l08xwwegwg)", () => {
  it("renders a centred prompt and a hidden file input named as asked", () => {
    render(<CoverDropzone name="cover" />);
    const zone = screen.getByTestId("cover-dropzone");
    expect(zone.className.split(/\s+/)).toEqual(expect.arrayContaining(["justify-center", "text-center"]));
    const input = screen.getByLabelText("Cover photo") as HTMLInputElement;
    expect(input.name).toBe("cover");
    expect(input.type).toBe("file");
    expect(screen.getByText(/drop a photo here/i)).toBeInTheDocument();
  });

  it("shows a preview with Replace and Remove once a file is chosen, and clears it on Remove", () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    render(<CoverDropzone name="cover" />);
    const input = screen.getByLabelText("Cover photo") as HTMLInputElement;
    const file = new File(["x"], "beach.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", "blob:x");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("img", { name: "Cover photo preview" })).toBeNull();
    expect(input.value).toBe("");
    vi.unstubAllGlobals();
  });
});
