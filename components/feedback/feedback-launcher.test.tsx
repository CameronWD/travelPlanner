import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  createMock,
  listMock,
  deleteMock,
  pathnameMock,
  onlineMock,
  toastMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  deleteMock: vi.fn(),
  pathnameMock: vi.fn(),
  onlineMock: vi.fn(),
  toastMock: vi.fn(),
}));

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

// No Toaster is mounted in these tests, so the store call is the only evidence
// of which message a path chose.
vi.mock("@/components/ui/use-toast", () => ({
  toast: toastMock,
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
    // Tightened from /Budget/: the fixture's body starts with the same word as
    // its page label, so the loose pattern matched the body too and could never
    // prove the label was rendered. This matches the meta line only.
    expect(
      screen.getByText(/Partner · Europe Summer 2026 · Budget/),
    ).toBeInTheDocument();
  });

  it("labels a note with the trip and the page it came from", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    // Author, trip and page label all sit on one meta line above the body.
    const meta = await screen.findByText(/Partner/);
    expect(meta).toHaveTextContent("Budget");
    expect(meta).toHaveTextContent("Europe Summer 2026");
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

  it("keeps a note in the box when storage refuses to hold it", async () => {
    onlineMock.mockReturnValue(false);
    const setItem = vi
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    try {
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "Nowhere to put this");
      await user.click(screen.getByRole("button", { name: /send/i }));

      // The box is now the only copy of the note, so it must not be cleared...
      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(box).toHaveValue("Nowhere to put this");
      // ...and nothing may claim it was saved.
      for (const [options] of toastMock.mock.calls) {
        expect(options.variant).toBe("destructive");
      }
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });

  it("clears the box when a rejected send leaves the note safely queued", async () => {
    createMock.mockResolvedValue({
      success: false,
      errors: { _form: ["nope"] },
    });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    const box = await screen.findByPlaceholderText(/what's on your mind/i);
    await user.type(box, "The server said no");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toContain(
        "The server said no",
      ),
    );
    // The Pending entry is the receipt, so the box is safe to clear — leaving
    // the text behind invites a second Send and so a second note.
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("keeps the floating button off a printed page", () => {
    render(<FeedbackLauncher />);
    expect(
      screen.getByRole("button", { name: /leave feedback/i }).className,
    ).toContain("print:hidden");
  });

  it("labels a note whose status it does not recognise instead of striking it out silently", async () => {
    listMock.mockResolvedValue({
      success: true,
      notes: [{ ...existingNote, status: "PENDING" }],
    });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    expect(await screen.findByText("PENDING")).toBeInTheDocument();
  });

  it("wears no badge on an open note", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();
    expect(screen.queryByText("OPEN")).toBeNull();
  });

  describe("the 4000-character cap", () => {
    it("stops the box accepting more than the server will", async () => {
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);

      expect(box).toHaveAttribute("maxlength", "4000");
    });

    // An over-long body queues and is then rejected by the schema on every
    // retry, so it must never reach the queue in the first place.
    it("cannot queue a body longer than the server accepts", async () => {
      onlineMock.mockReturnValue(false);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.click(box);
      await user.paste("x".repeat(4500));

      expect((box as HTMLTextAreaElement).value).toHaveLength(4000);

      await user.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() =>
        expect(
          window.localStorage.getItem("teepee.feedback.queue.v1"),
        ).not.toBeNull(),
      );
      const queued = JSON.parse(
        window.localStorage.getItem("teepee.feedback.queue.v1") ?? "[]",
      ) as { body: string }[];
      expect(queued).toHaveLength(1);
      expect(queued[0].body.length).toBeLessThanOrEqual(4000);
    });

    it("shows the count only once it is close to the limit", async () => {
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);

      expect(screen.queryByText(/\/4000/)).toBeNull();

      await user.click(box);
      await user.paste("x".repeat(3900));

      expect(await screen.findByText("3900/4000")).toBeInTheDocument();
    });
  });

  it("tells the user when a queued note is rejected outright, and sends the one behind it", async () => {
    window.localStorage.setItem(
      "teepee.feedback.queue.v1",
      JSON.stringify([
        {
          clientKey: "fk_doomed",
          body: "The server will never take this",
          route: "/trips/t1/plan",
          pageLabel: "Plan editor",
          tripId: "t1",
          tripName: "Europe Summer 2026",
          viewport: "390x844",
          userAgent: "iPhone",
          authoredAt: "2026-09-08T00:00:00.000Z",
        },
        {
          clientKey: "fk_fine",
          body: "Written on the train",
          route: "/trips/t1/plan",
          pageLabel: "Plan editor",
          tripId: "t1",
          tripName: "Europe Summer 2026",
          viewport: "390x844",
          userAgent: "iPhone",
          authoredAt: "2026-09-08T00:01:00.000Z",
        },
      ]),
    );
    createMock.mockImplementation(async (input) =>
      input.clientKey === "fk_doomed"
        ? { success: false, errors: { _form: ["too long"] } }
        : { success: true, note: { ...existingNote, id: "n9", body: input.body } },
    );

    render(<FeedbackLauncher />);

    // The doomed note no longer blocks the one written after it...
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toBe("[]"),
    );
    // ...and losing it is not allowed to be silent.
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [options] = toastMock.mock.calls[0];
    expect(options.variant).toBe("destructive");
    expect(String(options.title)).toMatch(/discarded/i);
    expect(String(options.description)).toContain(
      "The server will never take this",
    );
  });
});
