import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createMock, listMock, deleteMock, pathnameMock, onlineMock } = vi.hoisted(
  () => ({
    createMock: vi.fn(),
    listMock: vi.fn(),
    deleteMock: vi.fn(),
    pathnameMock: vi.fn(),
    onlineMock: vi.fn(),
  }),
);

vi.mock("@/server/actions/feedback", () => ({
  createFeedbackNote: createMock,
  listFeedbackNotes: listMock,
  deleteFeedbackNote: deleteMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
}));

vi.mock("@/components/ui/use-online-status", () => ({
  useOnlineStatus: onlineMock,
}));

import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";

const existingNote = {
  id: "n1",
  body: "Budget totals look wrong",
  route: "/trips/t1/budget",
  pageLabel: "Budget",
  tripName: "Europe Summer 2026",
  authorId: "u2",
  authorName: "Partner",
  status: "OPEN" as const,
  authoredAt: "2026-09-07T00:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
  pathnameMock.mockReturnValue("/trips/t1/plan");
  onlineMock.mockReturnValue(true);
  listMock.mockResolvedValue({ success: true, notes: [existingNote] });
  createMock.mockImplementation(async (input) => ({
    success: true,
    note: {
      id: "n2",
      body: input.body,
      route: input.route,
      pageLabel: input.pageLabel,
      tripName: input.tripName,
      authorId: "u1",
      authorName: "Cam",
      status: "OPEN",
      authoredAt: input.authoredAt,
    },
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("FeedbackLauncher", () => {
  it("renders a labelled floating button and no panel until opened", () => {
    render(<FeedbackLauncher />);
    expect(
      screen.getByRole("button", { name: /leave feedback/i }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what's on your mind/i)).toBeNull();
  });

  it("shows every traveller's existing notes when opened", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();
    expect(screen.getByText(/Partner/)).toBeInTheDocument();
    expect(screen.getByText(/Budget/)).toBeInTheDocument();
  });

  it("sends a note stamped with the current route and page label", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "Dragging is fiddly",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const input = createMock.mock.calls[0][0];
    expect(input.body).toBe("Dragging is fiddly");
    expect(input.route).toBe("/trips/t1/plan");
    expect(input.pageLabel).toBe("Plan editor");
    expect(input.tripId).toBe("t1");
    expect(input.clientKey).toMatch(/^fk_/);
    expect(Number.isNaN(Date.parse(input.authoredAt))).toBe(false);
  });

  it("clears the box after a note is sent", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    const box = await screen.findByPlaceholderText(/what's on your mind/i);
    await user.type(box, "Dragging is fiddly");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("queues a note written offline and marks it pending", async () => {
    onlineMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "No signal here",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("No signal here")).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toContain(
      "No signal here",
    );
  });

  it("flushes the queue once the connection returns", async () => {
    window.localStorage.setItem(
      "teepee.feedback.queue.v1",
      JSON.stringify([
        {
          clientKey: "fk_queued",
          body: "Written on the train",
          route: "/trips/t1/plan",
          pageLabel: "Plan editor",
          tripId: "t1",
          tripName: "Europe Summer 2026",
          viewport: "390x844",
          userAgent: "iPhone",
          authoredAt: "2026-09-08T00:00:00.000Z",
        },
      ]),
    );
    render(<FeedbackLauncher />);

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].clientKey).toBe("fk_queued");
    await waitFor(() =>
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toBe("[]"),
    );
  });

  it("keeps a note that failed to send rather than losing it", async () => {
    createMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "Server is down",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toContain(
        "Server is down",
      ),
    );
  });
});
