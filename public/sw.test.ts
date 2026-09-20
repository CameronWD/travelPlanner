import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, it, expect, vi } from "vitest";

/**
 * `public/sw.js` is the last hop before a push notification actually renders
 * on screen — and, before this file, nothing in the repo ever loaded or
 * exercised it. It is a plain script (no imports/exports, `self`-scoped), so
 * it can't be `import`ed like a module; it is loaded into a small sandboxed
 * realm via `vm`, with a hand-rolled `self` that records whichever listeners
 * it registers so a test can fire one directly, the same way the browser
 * would dispatch a real `push` or `notificationclick` event.
 *
 * Only the push/notificationclick surface is exercised here — install,
 * activate and the fetch-strategy branches are the offline-cache machinery
 * (covered by its mirror, `lib/offline.ts`, elsewhere) and aren't what this
 * branch touched.
 */
const SW_SOURCE = readFileSync(join(__dirname, "sw.js"), "utf8");

type Listener = (event: Record<string, unknown>) => void;

function loadServiceWorker() {
  const listeners = new Map<string, Listener[]>();

  const showNotification = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const claim = vi.fn().mockResolvedValue(undefined);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);

  const self = {
    addEventListener(type: string, cb: Listener) {
      const existing = listeners.get(type) ?? [];
      existing.push(cb);
      listeners.set(type, existing);
    },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim },
    skipWaiting,
    location: { origin: "https://teepee.example" },
  };

  const context = vm.createContext({
    self,
    console,
    // Minimal stub — install/activate aren't exercised by these tests, but
    // the file references `caches` at module scope inside those handlers'
    // closures, so it must at least exist.
    caches: {
      open: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn(),
      delete: vi.fn(),
    },
    // Forwards dynamically to globalThis.fetch rather than capturing it once
    // — tests assign `globalThis.fetch = fetchMock` per-test, after this
    // context already exists, so a static reference would miss it.
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  });

  vm.runInContext(SW_SOURCE, context, { filename: "sw.js" });

  // Most handlers here (push, notificationclick) build their own `waitUntil`
  // mock and await it explicitly to assert on it. The pushsubscriptionchange
  // tests below don't need that — they just want `dispatch` itself to wait
  // for the handler's async work — so when a test doesn't supply its own
  // `waitUntil`, this injects one that collects whatever the handler passes
  // and resolves once all of it settles.
  function dispatch(type: string, event: Record<string, unknown>): Promise<unknown> {
    const waits: Promise<unknown>[] = [];
    const evt =
      "waitUntil" in event
        ? event
        : {
            ...event,
            waitUntil(p: Promise<unknown>) {
              waits.push(p);
            },
          };
    for (const cb of listeners.get(type) ?? []) cb(evt);
    return Promise.all(waits);
  }

  return { dispatch, self, showNotification, matchAll, openWindow };
}

describe("public/sw.js — push", () => {
  it("shows a notification carrying the title, body, url and the served icon", () => {
    const { dispatch, showNotification } = loadServiceWorker();
    const waitUntil = vi.fn();

    dispatch("push", {
      data: {
        json: () => ({
          title: "TEEPEE",
          body: "A payment is due tomorrow",
          url: "/trips/t1/budget",
        }),
      },
      waitUntil,
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      "TEEPEE",
      expect.objectContaining({
        body: "A payment is due tomorrow",
        data: { url: "/trips/t1/budget" },
        // `/icon` is served by app/manifest.ts (app/icon.tsx) — confirmed
        // there is no `public/icons/` directory serving anything at all, so
        // this is the one path that actually resolves.
        icon: "/icon",
        badge: "/icon",
      }),
    );
  });

  it("falls back to defaults when the payload omits title/body/url", () => {
    const { dispatch, showNotification } = loadServiceWorker();
    const waitUntil = vi.fn();

    dispatch("push", { data: { json: () => ({}) }, waitUntil });

    expect(showNotification).toHaveBeenCalledWith(
      "Trip Planner",
      expect.objectContaining({ body: "", data: { url: "/" } }),
    );
  });

  it("does not throw, and shows nothing, when the payload is malformed", () => {
    const { dispatch, showNotification } = loadServiceWorker();
    const waitUntil = vi.fn();

    expect(() =>
      dispatch("push", {
        data: {
          json: () => {
            throw new SyntaxError("Unexpected token in JSON");
          },
        },
        waitUntil,
      }),
    ).not.toThrow();

    expect(showNotification).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("does not throw, and shows nothing, when there is no push payload at all", () => {
    const { dispatch, showNotification } = loadServiceWorker();
    const waitUntil = vi.fn();

    expect(() => dispatch("push", { data: null, waitUntil })).not.toThrow();

    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("public/sw.js — notificationclick", () => {
  it("closes the notification and opens/focuses its url", async () => {
    const { dispatch, matchAll, openWindow } = loadServiceWorker();
    matchAll.mockResolvedValue([]);
    const close = vi.fn();
    const waitUntil = vi.fn();

    dispatch("notificationclick", {
      notification: { data: { url: "/trips/t1" }, close },
      waitUntil,
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await waitUntil.mock.calls[0][0];

    expect(matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
    expect(openWindow).toHaveBeenCalledWith("/trips/t1");
  });

  it("focuses an already-open tab at the same url instead of opening a new one", async () => {
    const focus = vi.fn();
    const { dispatch, matchAll, openWindow } = loadServiceWorker();
    matchAll.mockResolvedValue([{ url: "/trips/t1", focus }]);
    const waitUntil = vi.fn();

    dispatch("notificationclick", {
      notification: { data: { url: "/trips/t1" }, close: vi.fn() },
      waitUntil,
    });

    await waitUntil.mock.calls[0][0];

    expect(focus).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("routes to '/' when the notification carries no url", async () => {
    const { dispatch, matchAll, openWindow } = loadServiceWorker();
    matchAll.mockResolvedValue([]);
    const waitUntil = vi.fn();

    dispatch("notificationclick", {
      notification: { data: null, close: vi.fn() },
      waitUntil,
    });

    await waitUntil.mock.calls[0][0];

    expect(openWindow).toHaveBeenCalledWith("/");
  });
});

describe("public/sw.js — pushsubscriptionchange", () => {
  it("re-subscribes and posts both endpoints when the subscription rotates", async () => {
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://new",
      toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
    });
    (self.registration as Record<string, unknown>).pushManager = { subscribe };
    const applicationServerKey = new Uint8Array([1]);

    await dispatch("pushsubscriptionchange", {
      oldSubscription: {
        endpoint: "https://old",
        options: { applicationServerKey },
      },
      newSubscription: null,
    });

    // Pins re-subscription to the SAME applicationServerKey the dead
    // subscription used — a fixed identity check, not expect.anything(),
    // so a handler that read some *other* key would also fail this. Getting
    // this wrong doesn't error loudly: it produces a subscription the
    // server's VAPID keys can't authenticate, so the heal "succeeds" and
    // pushes to that Device fail silently forever after.
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ applicationServerKey }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ oldEndpoint: "https://old", endpoint: "https://new" });
  });

  // Finding 2: without this, a healed-by-registration Device gets
  // `timezone: null` server-side and can never be elected for a Digest
  // (app/api/cron/digest/route.ts filters `timezone: { not: null }`) —
  // pinned the same way this file already pins `applicationServerKey` reuse.
  it("reports the Device's current IANA timezone in the heal body", async () => {
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://new",
      toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
    });
    (self.registration as Record<string, unknown>).pushManager = { subscribe };

    await dispatch("pushsubscriptionchange", {
      oldSubscription: { endpoint: "https://old", options: {} },
      newSubscription: null,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("still reports the new subscription when the browser gives no old one", async () => {
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://new",
      toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
    });
    (self.registration as Record<string, unknown>).pushManager = { subscribe };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    // The brief's fallback: with no old subscription to read a key off,
    // subscribe WITHOUT one rather than failing or sending a bogus value.
    // Checked directly on the call args rather than via an asymmetric
    // matcher, so this can't accidentally pass regardless of matcher support.
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][0]).not.toHaveProperty("applicationServerKey");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.oldEndpoint).toBeUndefined();
    expect(body.endpoint).toBe("https://new");
  });

  it("never throws when re-subscribing fails", async () => {
    const { dispatch, self } = loadServiceWorker();
    globalThis.fetch = vi.fn();
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockRejectedValue(new Error("denied")),
    };

    await expect(
      dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null }),
    ).resolves.not.toThrow();
  });
});
