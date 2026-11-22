import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { onlineMock, toastMock, oversizeMock } = vi.hoisted(() => ({
  onlineMock: vi.fn(),
  toastMock: vi.fn(),
  oversizeMock: vi.fn(),
}));

vi.mock("@/components/ui/use-online-status", () => ({ useOnlineStatus: onlineMock }));
vi.mock("@/components/ui/use-toast", () => ({ toast: toastMock }));
vi.mock("@/lib/image-compress", () => ({
  compressImage: async (f: File) => f,
  oversizeUploadMessage: oversizeMock,
}));

import { FeedbackPicturePicker, FeedbackPictureStrip } from "@/components/feedback/feedback-pictures";

beforeEach(() => {
  onlineMock.mockReturnValue(true);
  oversizeMock.mockReturnValue(null);
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:x"),
    revokeObjectURL: vi.fn(),
  }));
});

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [files, setFiles] = React.useState<File[]>([]);
  return <FeedbackPicturePicker files={files} onChange={setFiles} disabled={disabled} />;
}

describe("FeedbackPicturePicker", () => {
  it("adds accepted pictures and drops a type the server would refuse", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    await user.upload(input, [
      new File(["x"], "a.png", { type: "image/png" }),
      new File(["x"], "b.heic", { type: "image/heic" }),
    ]);
    expect(await screen.findAllByRole("button", { name: "Remove picture" })).toHaveLength(1);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("is disabled while a note is sending", () => {
    render(<Harness disabled />);
    expect(screen.getByRole("button", { name: "Add pictures" })).toBeDisabled();
  });
});

describe("FeedbackPicturePicker layout", () => {
  const png = () => new File(["x"], "a.png", { type: "image/png" });

  it("puts thumbnails above the button row, trailing in that row, offline line last", async () => {
    onlineMock.mockReturnValue(false);
    const { container } = render(
      <FeedbackPicturePicker
        files={[png()]}
        onChange={() => {}}
        disabled={false}
        trailing={<button type="button">Trail</button>}
      />,
    );
    const list = container.querySelector("ul")!;
    const pictures = screen.getByRole("button", { name: "Add pictures" });
    const trail = screen.getByRole("button", { name: "Trail" });
    const row = pictures.parentElement!;
    expect(row).toContainElement(trail);
    expect(list.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.contains(row)).toBe(false);
    const line = container.querySelector("p")!;
    expect(row.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.parentElement!.lastElementChild).toBe(line);
  });
});

describe("FeedbackPictureStrip", () => {
  it("renders nothing without pictures", () => {
    const { container } = render(<FeedbackPictureStrip pictures={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("loads the log's thumbnails lazily and decodes them off the main thread", () => {
    const { container } = render(<FeedbackPictureStrip pictures={[{ id: "a", url: "/a" }]} />);
    const thumb = container.querySelector("img")!;
    expect(thumb).toHaveAttribute("loading", "lazy");
    expect(thumb).toHaveAttribute("decoding", "async");
  });

  it("opens the chosen picture titled by its position", async () => {
    const user = userEvent.setup();
    render(<FeedbackPictureStrip pictures={[{ id: "a", url: "/a" }, { id: "b", url: "/b" }]} />);
    await user.click(screen.getByRole("button", { name: "Open picture 2 of 2" }));
    expect(await screen.findByRole("dialog", { name: "Picture 2 of 2" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("Picture 2 of 2")).toHaveAttribute("src", "/b"));
  });
});
