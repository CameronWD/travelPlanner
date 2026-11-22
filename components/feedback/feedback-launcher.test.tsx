import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  createMock,
  listMock,
  deleteMock,
  pathnameMock,
  onlineMock,
  toastMock,
  addPictureMock,
  compressMock,
  oversizeMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  deleteMock: vi.fn(),
  pathnameMock: vi.fn(),
  onlineMock: vi.fn(),
  toastMock: vi.fn(),
  addPictureMock: vi.fn(),
  compressMock: vi.fn(),
  oversizeMock: vi.fn(),
}));

vi.mock("@/server/actions/feedback", () => ({
  createFeedbackNote: createMock,
  listFeedbackNotes: listMock,
  deleteFeedbackNote: deleteMock,
  addFeedbackPicture: addPictureMock,
}));

vi.mock("@/lib/image-compress", () => ({
  compressImage: compressMock,
  oversizeUploadMessage: oversizeMock,
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

import { FeedbackLauncher, DOCKED_FROM } from "@/components/feedback/feedback-launcher";
import { ShellUserProvider } from "@/components/shell/shell-user";
import { requestAttention } from "@/lib/attention";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const existingNote = {
  id: "n1",
  body: "Budget totals look wrong",
  route: "/trips/t1/budget",
  pageLabel: "Budget",
  tripName: "Europe Summer 2026",
  authorName: "Partner",
  canDelete: true,
  status: "OPEN" as const,
  authoredAt: "2026-09-07T00:00:00.000Z",
  resolution: null,
  resolvedAt: null,
  pictures: [] as Array<{ id: string; url: string }>,
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
function makeMql(matches: boolean, media: string) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  let current = matches;
  return {
    get matches() {
      return current;
    },
    media,
    // Same surface as test/setup.ts's default matchMedia stub (onchange,
    // addListener/removeListener, dispatchEvent) — this replaces that stub in
    // this file's beforeEach for every test, including the Radix sheet
    // renders that never call stubViewport, so it must not be thinner.
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
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
    dispatchEvent: vi.fn(),
    setMatches(next: boolean) {
      current = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    /** How many `change` listeners are currently registered — proves cleanup ran. */
    listenerCount() {
      return listeners.size;
    },
  };
}

function stubViewport(dockedFromMd: boolean) {
  const mql = makeMql(dockedFromMd, DOCKED_FROM);
  const nonMatching = makeMql(false, "");
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      nonMatching.media = query;
      // FP-11: honour the query. Stubbing `() => mql` regardless of what was
      // asked meant a typo in DOCKED_FROM — or drift from sheet.tsx's `md:`
      // classes — still passed every test.
      return query === DOCKED_FROM ? mql : nonMatching;
    }),
  );
  return mql;
}

/**
 * A full `localStorage` replacement whose `setItem` throws from the
 * `failFromCall`th call onward (1 = every call; 2 = the first call succeeds,
 * every one after it fails).
 *
 * `vi.spyOn(window.Storage.prototype, "setItem")` looked like the obvious way
 * to simulate a quota error, and it is exactly what jsdom needs — but under
 * happy-dom it is order-dependent in a way neither the spy nor its test can
 * see: `window.localStorage.setItem` does not re-resolve `Storage.prototype`
 * on every call. The first time anything in this file calls it for real
 * (several earlier tests do, via `enqueue`/`write` in lib/feedback/queue.ts),
 * happy-dom binds that *instance*'s `setItem` to whatever the prototype
 * method was at that moment and keeps using that bound reference from then
 * on — so a `vi.spyOn` installed in a later test patches the prototype
 * (provably: `window.Storage.prototype.setItem === spy` is true) without
 * ever being seen by `window.localStorage.setItem`, which keeps calling the
 * original, un-mocked implementation. Standalone, with no earlier real call
 * to warm that binding, the spy is the first thing ever resolved and works
 * — which is why these two tests pass alone and fail only after the rest of
 * the file has run.
 *
 * Swapping out the whole global, the same way `stubViewport` replaces
 * `matchMedia`, sidesteps the binding entirely: a freshly constructed object
 * has no prior resolution to have cached, so it behaves the same regardless
 * of what ran before it. `vi.unstubAllGlobals()` in this file's `afterEach`
 * restores the real `localStorage` afterwards.
 */
function stubLocalStorageQuotaExceeded(failFromCall = 1) {
  const store = new Map<string, string>();
  let calls = 0;
  const fake: Storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      calls += 1;
      if (calls >= failFromCall) {
        throw new Error("QuotaExceededError");
      }
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("localStorage", fake);
  return fake;
}

let pictureSeq = 0;

beforeEach(() => {
  pictureSeq = 0;
  // FP-10: feedback-launcher.tsx caches its MediaQueryList against the
  // *current* window.matchMedia function reference. Installing a fresh stub
  // every test invalidates that cache by construction, so a test that never
  // calls stubViewport cannot inherit the previous test's media list.
  vi.stubGlobal("matchMedia", vi.fn(() => makeMql(false, "")));
  window.localStorage.clear();
  compressMock.mockImplementation(async (f: File) => f);
  oversizeMock.mockReturnValue(null);
  addPictureMock.mockImplementation(async () => ({
    success: true,
    id: `p${++pictureSeq}`,
    url: `/api/feedback-pictures/p${pictureSeq}`,
  }));
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
      authorName: "Cam",
      canDelete: true,
      status: "OPEN",
      authoredAt: input.authoredAt,
      pictures: [],
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
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

  it("pulses once when something asks for attention, then settles on its own (spec 2026-10-01 §G)", () => {
    vi.useFakeTimers();
    render(<FeedbackLauncher />);
    const button = screen.getByRole("button", { name: /leave feedback/i });
    expect(button.className).not.toMatch(/\btp-attention\b/);

    act(() => requestAttention("feedback"));
    expect(button.className).toMatch(/\btp-attention\b/);

    // Two 360ms beats; the class comes off on a timer rather than animationend
    // so it also settles under reduced motion, where the animation is `none`.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(button.className).not.toMatch(/\btp-attention\b/);
  });

  it("renders the notes the action returns, with delete gated to the viewer's own", async () => {
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

  // Task 10 extra requirement (b): ADR 0064 lets the second path segment be a
  // slug, not the Trip's id — tripIdFromRoute alone would stamp the note with
  // the slug. FeedbackTripMarker (set from the server-resolved id) usually
  // wins first, so this exercises the fallback: no marker mounted, only the
  // shell's trip list to resolve the slug against.
  it("resolves a slug in the URL back to the Trip's id via the shell's trip list", async () => {
    pathnameMock.mockReturnValue("/trips/christmas-in-europe-2026/plan");
    const user = userEvent.setup();
    render(
      <ShellUserProvider
        value={{
          user: { id: "u1", name: "Cam", image: null, email: "c@x" },
          isAdmin: false,
          adminQueue: EMPTY_ADMIN_QUEUE,
          trips: [{ id: "t9", slug: "christmas-in-europe-2026", name: "Christmas in Europe", statusLine: "" }],
          lastTrip: null,
        }}
      >
        <FeedbackLauncher />
      </ShellUserProvider>,
    );

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "Found via slug",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].tripId).toBe("t9");
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

  it("LA-023: sizes the empty log to fill the panel instead of leaving a blank void below it", async () => {
    listMock.mockResolvedValue({ success: true, notes: [] });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    const empty = await screen.findByText(/no feedback yet/i);
    const centred = empty.closest("div")!;
    expect(centred.className).toContain("flex-1");
    expect(centred.className).toContain("items-center");
    expect(centred.className).toContain("justify-center");
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
        await screen.findByText(/You’re on Plan editor/),
      ).toBeInTheDocument();

      pathnameMock.mockReturnValue("/trips/t1/budget");
      rerender(<FeedbackLauncher />);

      expect(
        await screen.findByText(/You’re on Money/),
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
      // panel must not say "You're on Money" — that promises the opposite of
      // what the freeze guarantees.
      expect(
        await screen.findByText(/You’re on Plan editor/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/You’re on Money/)).toBeNull();
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
      expect(secondInput.pageLabel).toBe("Money");
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
    stubLocalStorageQuotaExceeded();

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
  });

  it("clears the box when a rejected send leaves the note safely queued", async () => {
    createMock.mockResolvedValue({
      success: false,
      errors: { _: ["nope"] },
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

  it("does not list a note as sent when the queue removal was swallowed", async () => {
    // Storage accepts the initial enqueue (call 1) but then goes on to refuse
    // every write after it — including the removeFromQueue write once the
    // server has accepted the note. write() swallows that failure and hands
    // back the queue unchanged (lib/feedback/queue.ts), so the note is still
    // genuinely pending even though the server has it.
    stubLocalStorageQuotaExceeded(2);

    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "hello",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    // The removal never actually persisted, so the note must show once —
    // still Pending — never doubled into Sent as well.
    const item = await waitFor(() => {
      const matches = screen.getAllByText("hello");
      expect(matches).toHaveLength(1);
      const li = matches[0].closest("li");
      expect(li).not.toBeNull();
      return li as HTMLLIElement;
    });
    // Confirm the single occurrence is genuinely the Pending entry, not a
    // Sent one that happens to also render just once: PendingEntry always
    // wears the "Pending" badge and never a Delete button, while SentEntry
    // (this note's mocked result has canDelete: true, status OPEN — no
    // badge of its own) is the opposite of both. A fix that filtered the
    // note out of `pending` while still gating `setSent` on a stale
    // predicate would satisfy the length-1 check above but land here in
    // the wrong list, and these two assertions catch exactly that.
    expect(within(item).getByText("Pending")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: /delete/i })).toBeNull();
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
    // 24px on phone (DAY_VIEW §1); tablet/desktop keep the 1rem corner.
    expect(trigger.className).toContain("right-6");
    expect(trigger.className).toContain("md:right-4");
    expect(trigger.className).not.toMatch(/\bleft-/);
  });

  it("offsets the trigger above the mobile tab bar using its published height", () => {
    render(<FeedbackLauncher />);
    const trigger = screen.getByRole("button", { name: /leave feedback/i });
    expect(trigger.className).toContain(
      "bottom-[calc(var(--tp-tab-bar-h)+1.5rem+env(safe-area-inset-bottom))]",
    );
    expect(trigger.className).toContain("md:bottom-[calc(1rem+env(safe-area-inset-bottom))]");
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
      render(<FeedbackLauncher />);

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
      expect(screen.getByText(/You’re on Plan editor/)).toBeInTheDocument();
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
      expect(screen.getByText(/You’re on Plan editor/)).toBeInTheDocument();
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
        { ...existingNote, id: "done", body: "Fixed one", status: "DONE", resolvedAt: new Date().toISOString() },
        { ...existingNote, id: "wontfix", body: "Skipped one", status: "WONTFIX", resolvedAt: new Date().toISOString() },
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

  it("shows the site chip on a note from another site", async () => {
    listMock.mockResolvedValue({
      success: true,
      notes: [{ ...existingNote, siteChip: "Beta" }],
    });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    expect(await screen.findByText("Beta")).toBeInTheDocument();
  });

  it("shows no chip when siteChip is null", async () => {
    listMock.mockResolvedValue({
      success: true,
      notes: [{ ...existingNote, siteChip: null }],
    });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("deletes a note you wrote and drops it from the log", async () => {
    // FN-11: the Delete button's rendering was covered; pressing it never was.
    deleteMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /feedback/i }));
    expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /delete “Budget totals look wrong”/i }),
    );

    expect(deleteMock).toHaveBeenCalledWith("n1");
    await waitFor(() =>
      expect(screen.queryByText("Budget totals look wrong")).not.toBeInTheDocument(),
    );
  });

  it("reads the docked breakpoint the sheet actually uses", () => {
    // If DOCKED_FROM ever drifts from components/ui/sheet.tsx's `md:` classes
    // (or from calendar-views.tsx's duplicated literal), this is the assertion
    // that notices.
    expect(DOCKED_FROM).toBe("(min-width: 768px)");
  });

  it("asks matchMedia for the exact query it was given, not a fixed answer", () => {
    // FP-11: stubViewport used to hand back the same MediaQueryList for every
    // query — `(() => mql)` — so a typo in DOCKED_FROM, or drift from
    // sheet.tsx's `md:` classes, would still pass every test. This pair only
    // passes once the query is actually honoured.
    stubViewport(true);
    expect(window.matchMedia(DOCKED_FROM).matches).toBe(true);
    expect(window.matchMedia("(min-width: 9999px)").matches).toBe(false);
  });

  it("does not carry a cached media list between tests", async () => {
    // The cache lives at module scope (cachedMatchMediaFn / cachedDockedMql)
    // and is invalidated by comparing the *current* window.matchMedia
    // reference against the one last cached. Only the real component reaches
    // that comparison, via getDockedMql() — so render through it rather than
    // calling window.matchMedia directly.
    const user = userEvent.setup();
    const firstMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
    const { unmount } = render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /feedback/i }));
    expect(firstMatchMedia).toHaveBeenCalledWith(DOCKED_FROM);
    unmount();

    stubViewport(true);
    const secondMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /feedback/i }));
    // If the module-level cache had survived the swap to a new matchMedia
    // function reference, this second call would never happen — the
    // component would keep reading the first render's stale MediaQueryList.
    expect(secondMatchMedia).toHaveBeenCalledWith(DOCKED_FROM);
    expect(secondMatchMedia).not.toBe(firstMatchMedia);
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

    it("keeps the character counter mounted so the row does not jump", async () => {
      // FN-09: journal-editor.tsx documents the opposite as deliberate —
      // "always mounted, stable position". A counter that appears at COUNT_FROM
      // shifts the Send button sideways mid-sentence.
      const user = userEvent.setup();
      render(<FeedbackLauncher />);
      await user.click(screen.getByRole("button", { name: /feedback/i }));

      const counter = screen.getByRole("status");
      expect(counter).toBeInTheDocument();
      expect(counter).toHaveTextContent("");

      await user.type(screen.getByLabelText(/your feedback about teepee/i), "hello");
      expect(screen.getByRole("status")).toBeInTheDocument();
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
        ? { success: false, errors: { _: ["too long"] } }
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

  it("offers to put a discarded note's words back in the box", async () => {
    // FN-08: the toast showed the first 120 characters of what the server
    // refused and then dropped them on the floor. Losing what someone wrote
    // must never be silent, and showing it is not the same as keeping it.
    const queued = {
      clientKey: "fk_x",
      body: "A note the server will refuse",
      route: "/trips/t1/plan",
      pageLabel: "Plan editor",
      tripId: "t1",
      tripName: "Europe Summer 2026",
      viewport: "390x844",
      userAgent: "iPhone",
      authoredAt: "2026-09-08T04:05:06.000Z",
    };
    window.localStorage.setItem("teepee.feedback.queue.v1", JSON.stringify([queued]));
    createMock.mockResolvedValue({ success: false, errors: { body: ["too long"] } });

    render(<FeedbackLauncher />);

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const call = toastMock.mock.calls.at(-1)![0];
    expect(call.description).toContain("A note the server will refuse");
    expect(call.action).toBeDefined();
  });

  describe("resolved notes (spec 2026-10-05 §A)", () => {
    const NOW = new Date("2026-10-12T12:00:00.000Z");
    const recentDone = {
      ...existingNote,
      id: "recent",
      body: "Totals fixed",
      status: "DONE" as const,
      authoredAt: "2026-09-10T00:00:00.000Z",
      resolution: "Budget totals now add up per currency.",
      resolvedAt: "2026-10-10T09:00:00.000Z",
    };
    const edgeDone = {
      ...existingNote,
      id: "edge",
      body: "Resolved a week ago to the minute",
      status: "DONE" as const,
      authoredAt: "2026-09-11T00:00:00.000Z",
      resolution: null,
      resolvedAt: "2026-10-05T12:00:00.000Z",
    };
    const oldDone = {
      ...existingNote,
      id: "old",
      body: "Old fixed thing",
      status: "DONE" as const,
      authoredAt: "2026-09-01T00:00:00.000Z",
      resolution: "Fixed a while back.",
      resolvedAt: "2026-09-20T09:00:00.000Z",
    };
    const oldWontFix = {
      ...existingNote,
      id: "oldwf",
      body: "Old skipped thing",
      status: "WONTFIX" as const,
      authoredAt: "2026-09-05T00:00:00.000Z",
      resolution: null,
      resolvedAt: "2026-09-21T09:00:00.000Z",
    };

    beforeEach(() => {
      // Only Date is faked: userEvent and Radix still need real timers.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
    });

    async function openPanel() {
      const user = userEvent.setup();
      render(<FeedbackLauncher />);
      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByPlaceholderText(/what's on your mind/i);
      return user;
    }

    it("lists open notes and ones resolved within 7 days, and hides older ones behind Show resolved (N)", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [existingNote, oldDone, recentDone, edgeDone, oldWontFix],
      });
      await openPanel();

      expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();
      expect(screen.getByText("Totals fixed")).toBeInTheDocument();
      expect(screen.getByText("Resolved a week ago to the minute")).toBeInTheDocument();
      expect(screen.queryByText("Old fixed thing")).toBeNull();
      expect(screen.queryByText("Old skipped thing")).toBeNull();
      expect(screen.getByRole("switch", { name: "Show resolved (2)" })).toBeInTheDocument();
    });

    it("fills the phone: a 90dvh frame, a list that keeps its height, and header, switch row and composer that never shrink", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [existingNote, oldDone],
      });
      await openPanel();

      const frame = await screen.findByRole("dialog");
      expect(frame.className).toContain("h-[90dvh]");
      expect(frame.className).not.toMatch(/(^|\s)h-auto/);
      expect(frame.className).toContain("md:h-auto");

      const list = (await screen.findByText("Budget totals look wrong")).closest("ul")!
        .parentElement!;
      expect(list.className).toContain("min-h-0");
      expect(list.className).toContain("flex-1");
      expect(list.className).toContain("overflow-y-auto");

      const header = screen.getByText("Feedback", { selector: "h2" }).parentElement!;
      expect(header.className).toContain("shrink-0");
      const switchRow = screen.getByRole("switch", { name: "Show resolved (1)" }).closest("label")!;
      expect(switchRow.className).toContain("shrink-0");
      expect(list.contains(switchRow)).toBe(false);
      const composer = screen.getByPlaceholderText(/what's on your mind/i).parentElement!;
      expect(composer.className).toContain("shrink-0");
    });

    it("reveals hidden notes in their normal date order, and a second tap hides them again", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [existingNote, oldDone, recentDone, oldWontFix],
      });
      const user = await openPanel();

      await user.click(await screen.findByRole("switch", { name: "Show resolved (2)" }));

      const bodies = screen
        .getAllByRole("listitem")
        .map((li) => li.textContent ?? "");
      const order = ["Old fixed thing", "Old skipped thing", "Budget totals look wrong", "Totals fixed"].map(
        (text) => bodies.findIndex((b) => b.includes(text)),
      );
      expect(order).toEqual([0, 1, 2, 3]);

      await user.click(screen.getByRole("switch", { name: "Show resolved (2)" }));
      expect(screen.queryByText("Old fixed thing")).toBeNull();
      expect(screen.getByRole("switch", { name: "Show resolved (2)" })).toBeInTheDocument();
    });

    it("gives a note's text the panel's full width, below the row of badges and delete", async () => {
      listMock.mockResolvedValue({ success: true, notes: [existingNote] });
      await openPanel();

      const body = await screen.findByText("Budget totals look wrong");
      const li = body.closest("li")!;
      expect(body.parentElement).toBe(li);
      expect(li.className.split(/\s+/)).toContain("flex-col");
    });

    it("shows Show resolved as a switch whose state is visible", async () => {
      listMock.mockResolvedValue({ success: true, notes: [existingNote, oldDone] });
      const user = await openPanel();

      const toggle = await screen.findByRole("switch", { name: "Show resolved (1)" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      await user.click(toggle);
      expect(screen.getByRole("switch", { name: "Show resolved (1)" })).toHaveAttribute("aria-checked", "true");
    });

    it("shows no Show resolved switch when nothing is hidden", async () => {
      listMock.mockResolvedValue({ success: true, notes: [existingNote, recentDone] });
      await openPanel();

      expect(await screen.findByText("Totals fixed")).toBeInTheDocument();
      expect(screen.queryByRole("switch", { name: /show resolved/i })).toBeNull();
    });

    it("writes the status, date and Resolution beneath a closed note, or just status and date without one", async () => {
      listMock.mockResolvedValue({ success: true, notes: [recentDone, oldWontFix] });
      const user = await openPanel();

      expect(
        await screen.findByText("Done 10 Oct: Budget totals now add up per currency."),
      ).toBeInTheDocument();
      // The badge is unchanged alongside the new line.
      expect(screen.getByText("Done")).toBeInTheDocument();

      await user.click(screen.getByRole("switch", { name: "Show resolved (1)" }));
      expect(screen.getByText("Won't fix 21 Sep")).toBeInTheDocument();
    });

    it("applies the same rule to every author's notes in an Admin's panel", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [
          { ...recentDone, authorName: "Sister", canDelete: false },
          { ...oldDone, authorName: "Sister", canDelete: false },
          { ...oldWontFix, authorName: "Cam", canDelete: true },
        ],
      });
      await openPanel();

      expect(await screen.findByText("Totals fixed")).toBeInTheDocument();
      expect(screen.queryByText("Old fixed thing")).toBeNull();
      expect(screen.queryByText("Old skipped thing")).toBeNull();
      expect(screen.getByRole("switch", { name: "Show resolved (2)" })).toBeInTheDocument();
    });

    it("keeps the toggle, not the empty-log message, when every note is hidden", async () => {
      listMock.mockResolvedValue({ success: true, notes: [oldDone] });
      await openPanel();

      expect(await screen.findByRole("switch", { name: "Show resolved (1)" })).toBeInTheDocument();
      expect(screen.queryByText(/no feedback yet/i)).toBeNull();
    });

    it("hides resolved notes again every time the panel opens", async () => {
      listMock.mockResolvedValue({ success: true, notes: [existingNote, oldDone] });
      const user = await openPanel();

      await user.click(await screen.findByRole("switch", { name: "Show resolved (1)" }));
      expect(screen.getByText("Old fixed thing")).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      expect(await screen.findByRole("switch", { name: "Show resolved (1)" })).toBeInTheDocument();
      expect(screen.queryByText("Old fixed thing")).toBeNull();
    });
  });
});

describe("FeedbackLauncher pictures", () => {
  const png = (name: string) => new File(["x"], name, { type: "image/png" });

  let rerenderPanel: (ui: React.ReactElement) => void;
  async function openPanel() {
    const user = userEvent.setup();
    ({ rerender: rerenderPanel } = render(<FeedbackLauncher />));
    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await screen.findByPlaceholderText(/what's on your mind/i);
    return user;
  }
  const fileInput = () =>
    document.querySelector<HTMLInputElement>('input[type="file"]')!;

  beforeEach(() => {
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    }));
  });

  it("offers Add pictures and a hidden image picker", async () => {
    await openPanel();
    expect(screen.getByRole("button", { name: "Add pictures" })).toBeEnabled();
    const input = fileInput();
    expect(input.accept).toBe("image/*");
    expect(input.multiple).toBe(true);
  });

  it("shows a removable thumbnail per chosen picture", async () => {
    const user = await openPanel();
    await user.upload(fileInput(), [png("a.png"), png("b.png")]);
    expect(await screen.findAllByRole("button", { name: "Remove picture" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Remove picture" })[0]);
    expect(screen.getAllByRole("button", { name: "Remove picture" })).toHaveLength(1);
  });

  it("keeps four of six and says so", async () => {
    const user = await openPanel();
    await user.upload(fileInput(), ["1", "2", "3", "4", "5", "6"].map((n) => png(`${n}.png`)));
    expect(await screen.findAllByRole("button", { name: "Remove picture" })).toHaveLength(4);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Up to 4 pictures per note." }));
  });

  it("refuses a file the oversize check rejects, with its message", async () => {
    oversizeMock.mockReturnValueOnce("Too big.");
    const user = await openPanel();
    await user.upload(fileInput(), [png("big.png")]);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Too big." })),
    );
    expect(screen.queryByRole("button", { name: "Remove picture" })).toBeNull();
  });

  it("offline: Add pictures is disabled and says why; chosen pictures block Send", async () => {
    const user = await openPanel();
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), "Hello");
    await user.upload(fileInput(), [png("a.png")]);
    await screen.findByRole("button", { name: "Remove picture" });
    onlineMock.mockReturnValue(false);
    rerenderPanel(<FeedbackLauncher />);
    expect(await screen.findByText(
      "You’re offline. Remove the pictures to queue this note, or send it when you’re back online.",
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove picture" }));
    expect(screen.getByText("Pictures need a connection.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add pictures" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
  });

  it("sends the note, then uploads each picture in order against its id", async () => {
    const user = await openPanel();
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), "With photos");
    await user.upload(fileInput(), [png("a.png"), png("b.png")]);
    await screen.findAllByRole("button", { name: "Remove picture" });
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(addPictureMock).toHaveBeenCalledTimes(2));
    expect(compressMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.invocationCallOrder[0]).toBeLessThan(addPictureMock.mock.invocationCallOrder[0]);
    const forms = addPictureMock.mock.calls.map((c) => c[0] as FormData);
    expect(forms.map((f) => f.get("noteId"))).toEqual(["n2", "n2"]);
    expect(forms.map((f) => (f.get("file") as File).name)).toEqual(["a.png", "b.png"]);
    expect(await screen.findAllByRole("button", { name: /open picture/i })).toHaveLength(2);
  });

  it("keeps the note and says so when a picture fails", async () => {
    addPictureMock.mockResolvedValueOnce({ success: false, errors: {} });
    const user = await openPanel();
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), "Half");
    await user.upload(fileInput(), [png("a.png"), png("b.png")]);
    await screen.findAllByRole("button", { name: "Remove picture" });
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Note sent, but 1 picture didn’t upload." }),
      ),
    );
    expect(screen.getByText("Half")).toBeInTheDocument();
  });

  it("opens a sent picture full size in a dialog", async () => {
    listMock.mockResolvedValue({
      success: true,
      notes: [{ ...existingNote, pictures: [{ id: "a", url: "/a" }, { id: "b", url: "/b" }] }],
    });
    const user = await openPanel();
    await user.click((await screen.findAllByRole("button", { name: /open picture/i }))[0]);
    expect(await screen.findByRole("dialog", { name: "Picture 1 of 2" })).toBeInTheDocument();
  });

  it("keeps the text and pictures when creating the note fails, then retries with the same key", async () => {
    createMock.mockRejectedValueOnce(new Error("offline"));
    const user = await openPanel();
    const box = screen.getByPlaceholderText(/what's on your mind/i);
    await user.type(box, "Keep me");
    await user.upload(fileInput(), [png("a.png"), png("b.png")]);
    await screen.findAllByRole("button", { name: "Remove picture" });
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn’t send. Your note and pictures are still here, so try again.",
        }),
      ),
    );
    expect(box).toHaveValue("Keep me");
    expect(screen.getAllByRole("button", { name: "Remove picture" })).toHaveLength(2);
    expect(window.localStorage.getItem("teepee.feedback.queue.v1") ?? "[]").not.toContain("Keep me");
    expect(addPictureMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(addPictureMock).toHaveBeenCalledTimes(2));
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0].clientKey).toBe(createMock.mock.calls[0][0].clientKey);
  });

  it("creates one note and uploads each picture once on a double click", async () => {
    let release!: () => void;
    addPictureMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ success: true, id: "p9", url: "/p9" });
        }),
    );
    const user = await openPanel();
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), "Once");
    await user.upload(fileInput(), [png("a.png"), png("b.png")]);
    await screen.findAllByRole("button", { name: "Remove picture" });
    const send = screen.getByRole("button", { name: /send/i });
    await user.click(send);
    await waitFor(() => expect(addPictureMock).toHaveBeenCalledTimes(1));
    await user.click(send);
    release();
    await waitFor(() => expect(addPictureMock).toHaveBeenCalledTimes(2));
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("locks Remove, Add and Send while a pick is compressing", async () => {
    let release!: () => void;
    compressMock.mockImplementationOnce(
      (f: File) => new Promise((resolve) => { release = () => resolve(f); }),
    );
    const user = await openPanel();
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), "Busy");
    await user.upload(fileInput(), [png("a.png")]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add pictures" })).toBeDisabled());
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    release();
    await screen.findByRole("button", { name: "Remove picture" });
    expect(screen.getByRole("button", { name: "Add pictures" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
  });

  it("keeps Send disabled for an empty body even with pictures", async () => {
    const user = await openPanel();
    await user.upload(fileInput(), [png("a.png")]);
    await screen.findByRole("button", { name: "Remove picture" });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});
