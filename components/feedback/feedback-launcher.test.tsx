import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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

/** Mirrors the component's own DOCKED_FROM (not exported) for the stub's `media` field. */
const DOCKED_FROM = "(min-width: 768px)";

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

/**
 * The panel reads `matchMedia("(min-width: 768px)")`, live, to decide which
 * shape it is in: the docked card from md up (page usable beside it, so
 * non-modal) or the full-screen one below md (modal, scroll-locked, page hidden
 * from screen readers). jsdom has no layout, so any test that cares must say.
 *
 * Left unstubbed, test/setup.ts's matchMedia reports `matches: false` — the
 * full-screen, modal shape.
 *
 * The returned `setMatches` simulates the viewport actually changing while the
 * panel is open (a phone rotating, a window narrowing): it flips what the
 * stubbed MediaQueryList reports and fires a `change` event at every listener
 * the component registered, the same way a real MediaQueryList would.
 */
function stubViewport(dockedFromMd: boolean) {
  let matches = dockedFromMd;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: DOCKED_FROM,
    addEventListener: (
      event: string,
      cb: (event: { matches: boolean }) => void,
    ) => {
      if (event === "change") listeners.add(cb);
    },
    removeEventListener: (
      event: string,
      cb: (event: { matches: boolean }) => void,
    ) => {
      if (event === "change") listeners.delete(cb);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    (() => mql) as unknown as typeof matchMedia,
  );
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    /** How many `change` listeners are currently registered — proves cleanup ran. */
    listenerCount() {
      return listeners.size;
    },
  };
}

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
  vi.unstubAllGlobals();
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

  describe("the panel is non-modal from md up, so the page behind it can navigate mid-draft", () => {
    it("files a note against the page where typing began, not the page at send time", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "Started writing here");

      // The page behind the (now non-modal) panel navigates while the draft
      // is still open — the note must not follow it.
      pathnameMock.mockReturnValue("/trips/t1/summary");
      rerender(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
      const input = createMock.mock.calls[0][0];
      expect(input.route).toBe("/trips/t1/plan");
      expect(input.pageLabel).toBe("Plan editor");
    });

    it("keeps the description tracking the live route while the box is empty", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      expect(
        await screen.findByText(/You're on Plan editor/),
      ).toBeInTheDocument();

      pathnameMock.mockReturnValue("/trips/t1/budget");
      rerender(<FeedbackLauncher />);

      expect(
        await screen.findByText(/You're on Budget/),
      ).toBeInTheDocument();
    });

    it("names the frozen page in the description once a draft exists", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      const { rerender } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "Started writing here");

      pathnameMock.mockReturnValue("/trips/t1/budget");
      rerender(<FeedbackLauncher />);

      // The note is frozen to Plan editor and will be filed there, so the
      // panel must not say "You're on Budget" — that promises the opposite of
      // what the freeze guarantees.
      expect(
        await screen.findByText(/You're on Plan editor/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/You're on Budget/)).toBeNull();
    });

    it("lets the next draft pick up the route after a previous one was sent", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "First note, written on plan");
      await user.click(screen.getByRole("button", { name: /send/i }));
      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

      pathnameMock.mockReturnValue("/trips/t1/budget");
      rerender(<FeedbackLauncher />);

      await user.type(box, "Second note, written on budget");
      await user.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
      const secondInput = createMock.mock.calls[1][0];
      expect(secondInput.route).toBe("/trips/t1/budget");
      expect(secondInput.pageLabel).toBe("Budget");
    });
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

  it("anchors the trigger to the bottom right", () => {
    render(<FeedbackLauncher />);
    const trigger = screen.getByRole("button", { name: /leave feedback/i });
    expect(trigger.className).toContain("right-4");
    expect(trigger.className).not.toContain("left-4");
  });

  it("offsets the trigger above the mobile tab bar using its published height", () => {
    render(<FeedbackLauncher />);
    const trigger = screen.getByRole("button", { name: /leave feedback/i });
    expect(trigger.className).toContain(
      "bottom-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))]",
    );
  });

  it("opens a docked panel that leaves the page visible behind it", async () => {
    // This is the md-and-up case by definition — below md the panel covers the
    // page, so there is nothing to leave visible. Say so, rather than leaning
    // on jsdom's default of "no viewport at all".
    stubViewport(true);
    const user = userEvent.setup();
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    const panel = await screen.findByRole("dialog");
    expect(panel.className).toContain("md:w-[560px]");
    expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
  });

  describe("the page behind the docked panel", () => {
    it("does not dismiss the panel when it is clicked", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Somewhere else on the page</button>
          <FeedbackLauncher />
        </>,
      );

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      // A chat widget does not close because you used the page behind it, and
      // "visible and usable behind it" is worthless if the first click out
      // there is spent reopening the panel.
      await user.click(
        screen.getByRole("button", { name: /somewhere else on the page/i }),
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/what's on your mind/i),
      ).toBeInTheDocument();
    });

    it("keeps a half-written draft when the page behind it is clicked", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Somewhere else on the page</button>
          <FeedbackLauncher />
        </>,
      );

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "Half a thought");

      await user.click(
        screen.getByRole("button", { name: /somewhere else on the page/i }),
      );

      expect(box).toHaveValue("Half a thought");
    });

    it("puts focus in the write box on open, not on a listed note's Delete button", async () => {
      // Radix's default autofocus-on-open behaviour is "first tabbable element
      // inside the content" — with a deletable note listed, that element sits
      // ahead of the write box in DOM order and is a destructive control. The
      // panel is for writing, so opening it should put the cursor in the box.
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher currentUserId="u2" />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await screen.findByRole("button", { name: /delete/i });

      await waitFor(() => expect(document.activeElement).toBe(box));
    });

    it("still closes on Escape", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("still closes on the X", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^close$/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("closes when the trigger is clicked while the panel is open", async () => {
      // SheetTrigger (asChild) composes Radix's onOpenToggle onto the click,
      // so clicking the launcher again while open now closes the panel —
      // it used to be a no-op before the SheetTrigger rewiring above. Every
      // chat widget on the web closes on a second click of its launcher, and
      // the owner chose to keep that rather than suppress it.
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      const trigger = screen.getByRole("button", { name: /leave feedback/i });
      await user.click(trigger);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(trigger);

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("returns focus to the trigger after closing it via the trigger itself", async () => {
      // It is what was just clicked, so this should hold trivially — but the
      // same onCloseAutoFocus wiring that returns focus on Escape/X governs
      // this route too, so assert it rather than assume it.
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      const trigger = screen.getByRole("button", { name: /leave feedback/i });
      await user.click(trigger);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(trigger);

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });

    it("returns focus to the trigger after closing via Escape", async () => {
      // The trigger is wired through SheetTrigger (asChild) specifically so
      // Radix's internal triggerRef is populated — without it, Radix's
      // onCloseAutoFocus preventDefault()s and then no-ops on a null ref,
      // and FocusScope skips its own restore-previous-focus fallback because
      // the default was already prevented. Left unfixed, focus lands on
      // <body>, a WCAG 2.4.3 failure.
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      const trigger = screen.getByRole("button", { name: /leave feedback/i });
      await user.click(trigger);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });

    it("returns focus to the trigger after closing via the X", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      const trigger = screen.getByRole("button", { name: /leave feedback/i });
      await user.click(trigger);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^close$/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe("the panel is modal below md and non-modal from md up", () => {
    it("hides and locks the page behind the full-screen panel below md", async () => {
      stubViewport(false);
      const user = userEvent.setup();
      const { container } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByRole("dialog");

      // Covering the whole screen while a screen-reader user can still walk the
      // page underneath is the bug; modal is what fixes it.
      expect(container).toHaveAttribute("aria-hidden", "true");
      // Radix hangs the scroll lock (RemoveScroll) off the overlay, so the
      // overlay has to exist here — invisible behind an opaque full-screen
      // panel, but it is what stops the page scrolling underneath.
      expect(document.querySelector(".backdrop-blur-sm")).not.toBeNull();
      expect(document.body.style.pointerEvents).toBe("none");
    });

    it("leaves the page behind reachable from md up", async () => {
      stubViewport(true);
      const user = userEvent.setup();
      const { container } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByRole("dialog");

      expect(container).not.toHaveAttribute("aria-hidden");
      expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
      expect(document.body.style.pointerEvents).not.toBe("none");
    });

    it("falls back to the modal panel when matchMedia is unavailable", async () => {
      // The SSR-safe branch: no way to ask about the viewport, so assume the
      // shape whose failure mode is a nuisance rather than a bug.
      vi.stubGlobal("matchMedia", undefined);
      const user = userEvent.setup();
      const { container } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByRole("dialog");

      expect(container).toHaveAttribute("aria-hidden", "true");
      expect(document.querySelector(".backdrop-blur-sm")).not.toBeNull();
    });

    it("degrades gracefully when the MediaQueryList only has the old addListener API", async () => {
      // Safari 12/13's MediaQueryList has addListener/removeListener but no
      // addEventListener, and this project has no browserslist narrowing
      // Next's defaults away from it. Subscribing must skip live tracking
      // rather than throw inside the effect (which would surface as an error
      // boundary on every panel open).
      vi.stubGlobal(
        "matchMedia",
        (() => ({
          matches: true,
          media: DOCKED_FROM,
          addListener: () => {},
          removeListener: () => {},
        })) as unknown as typeof matchMedia,
      );
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("never asks about the viewport while rendering, only once it has been opened", () => {
      // On the server there is no window to ask, and the subscription only
      // ever activates once the panel has opened at least once — mounting
      // the trigger button alone must never touch matchMedia.
      const matchMediaSpy = vi.fn(() => ({ matches: true }));
      vi.stubGlobal("matchMedia", matchMediaSpy);

      render(<FeedbackLauncher />);

      expect(matchMediaSpy).not.toHaveBeenCalled();
    });
  });

  describe("the panel's shape stays live from its first open onward", () => {
    it("becomes non-modal with no overlay when a panel opened below md is widened past it", async () => {
      const viewport = stubViewport(false);
      const user = userEvent.setup();
      const { container } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByRole("dialog");
      expect(container).toHaveAttribute("aria-hidden", "true");

      act(() => {
        viewport.setMatches(true);
      });

      await waitFor(() => expect(container).not.toHaveAttribute("aria-hidden"));
      expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
      expect(document.body.style.pointerEvents).not.toBe("none");
      expect(screen.getByRole("dialog").className).toContain("md:w-[560px]");
    });

    it("becomes modal when a panel opened above md is narrowed below it", async () => {
      const viewport = stubViewport(true);
      const user = userEvent.setup();
      const { container } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByRole("dialog");
      expect(container).not.toHaveAttribute("aria-hidden");

      act(() => {
        viewport.setMatches(false);
      });

      await waitFor(() =>
        expect(container).toHaveAttribute("aria-hidden", "true"),
      );
      expect(document.querySelector(".backdrop-blur-sm")).not.toBeNull();
      expect(document.body.style.pointerEvents).toBe("none");
    });

    it("keeps the draft text and frozen context when widening past md turns the panel non-modal", async () => {
      // Radix swaps DialogContentModal for DialogContentNonModal when `modal`
      // flips, remounting the content subtree — but the draft and its frozen
      // context live in this component (the parent), not in that subtree, so
      // they must survive the swap untouched.
      const viewport = stubViewport(false);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "Started on a phone");

      // Navigate before the swap, the way a live route would: proves the
      // *frozen* context (Plan editor) survives, not just a re-read live one.
      pathnameMock.mockReturnValue("/trips/t1/budget");

      act(() => {
        viewport.setMatches(true);
      });

      await waitFor(() =>
        expect(document.querySelector(".backdrop-blur-sm")).toBeNull(),
      );

      const boxAfter = screen.getByPlaceholderText(/what's on your mind/i);
      expect(boxAfter).toHaveValue("Started on a phone");
      expect(screen.getByText(/You're on Plan editor/)).toBeInTheDocument();
      // The remount replaces the textarea's DOM node entirely, so this is
      // only true because onOpenAutoFocus explicitly refocuses the *new* node
      // — without it, a mid-keystroke user's cursor would land wherever
      // Radix's default (first tabbable element) puts it instead.
      expect(document.activeElement).toBe(boxAfter);
    });

    it("keeps the draft text and frozen context when narrowing below md turns the panel modal", async () => {
      const viewport = stubViewport(true);
      const user = userEvent.setup();
      render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      const box = await screen.findByPlaceholderText(/what's on your mind/i);
      await user.type(box, "Started on a desktop");

      pathnameMock.mockReturnValue("/trips/t1/budget");

      act(() => {
        viewport.setMatches(false);
      });

      await waitFor(() =>
        expect(document.querySelector(".backdrop-blur-sm")).not.toBeNull(),
      );

      const boxAfter = screen.getByPlaceholderText(/what's on your mind/i);
      expect(boxAfter).toHaveValue("Started on a desktop");
      expect(screen.getByText(/You're on Plan editor/)).toBeInTheDocument();
      expect(document.activeElement).toBe(boxAfter);
    });

    it("keeps its media-query listener subscribed across a close — only unmount removes it", async () => {
      // docked is latched to "has this panel ever opened", not "is it open
      // right now" (see useDockedViewport): gating on `open` looked right but
      // let `docked` snap to false in the same render `open` does, flipping
      // `modal` underneath Radix's ~200ms exit-animation window. Latching
      // means the subscription deliberately outlives a close — proved here by
      // checking it is *still* subscribed right after closing, not just by
      // checking it's eventually gone — and only unmounting tears it down.
      const viewport = stubViewport(true);
      const user = userEvent.setup();
      const { unmount } = render(<FeedbackLauncher />);

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByRole("dialog");
      expect(viewport.listenerCount()).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: /^close$/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(viewport.listenerCount()).toBeGreaterThan(0);

      unmount();
      expect(viewport.listenerCount()).toBe(0);
    });
  });

  it("marks a done Feedback note with a green pill and a won't-fix one without", async () => {
    listMock.mockResolvedValue({
      success: true,
      notes: [
        { ...existingNote, id: "done", body: "Fixed one", status: "DONE" },
        { ...existingNote, id: "wontfix", body: "Skipped one", status: "WONTFIX" },
      ],
    });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    const done = await screen.findByText("Done");
    expect(done.className).toContain("bg-success");

    const wontFix = screen.getByText("Won't fix");
    expect(wontFix.className).not.toContain("bg-success");
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
