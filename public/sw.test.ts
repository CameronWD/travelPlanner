import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * `public/sw.js` is the last hop before a push notification actually renders
 * on screen — and, before this file, nothing in the repo ever loaded or
 * exercised it. It is a plain script (no imports/exports, `self`-scoped), so
 * it can't be `import`ed like a module; it is loaded into a small sandboxed
 * realm via `vm`, with a hand-rolled `self` that records whichever listeners
 * it registers so a test can fire one directly, the same way the browser
 * would dispatch a real `push` or `notificationclick` event.
 *
 * The push/notificationclick surface is exercised with a stub `caches`; the
 * cache-bounds tests at the bottom (spec 2026-10-06 §T) pass an in-memory
 * `caches` and drive fetch and activate. The strategy rules themselves are
 * covered by their mirror, `lib/offline.ts`.
 */
const SW_SOURCE = readFileSync(join(__dirname, "sw.js"), "utf8");

// The tests below assign `globalThis.fetch` directly. Every one of them sets
// its own mock before use, so nothing is broken today — but a test added
// later that expects the real (or an earlier) fetch would silently inherit
// whichever mock ran last. Restore it (CD-08).
const REAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
});

type Listener = (event: Record<string, unknown>) => void;

function loadServiceWorker(opts: { href?: string; caches?: unknown } = {}) {
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
    location: { origin: "https://teepee.example", href: opts.href ?? "https://teepee.example/sw.js?build=b1" },
  };

  const context = vm.createContext({
    self,
    console,
    // Minimal stub — install/activate aren't exercised by these tests, but
    // the file references `caches` at module scope inside those handlers'
    // closures, so it must at least exist.
    caches: opts.caches ?? {
      open: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn(),
      delete: vi.fn(),
    },
    // A vm realm gets the JS builtins only; URL is a Node/Web global, and the
    // worker's URL classification needs it to reach the fetch strategies.
    URL,
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
        // Static files under public/icons/, added when the generated `/icon`
        // route was retired.
        icon: "/icons/icon-192.png",
        badge: "/icons/push-badge-96.png",
      }),
    );
  });

  it("falls back to defaults when the payload omits title/body/url", () => {
    const { dispatch, showNotification } = loadServiceWorker();
    const waitUntil = vi.fn();

    dispatch("push", { data: { json: () => ({}) }, waitUntil });

    expect(showNotification).toHaveBeenCalledWith(
      "Teepee",
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

  it("gives up quietly when re-subscribing resolves to nothing", async () => {
    // public/sw.js:344 — `if (!fresh || !fresh.endpoint) return;`. A browser
    // that resolves subscribe() to null leaves nothing to report, and posting
    // a body with no endpoint would write a Device row that can never be
    // pushed to.
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue(null),
    };
    // `null.toJSON` throws, and the handler's own catch swallows any thrown
    // error just as quietly as a guarded early return would — so asserting
    // fetch wasn't called alone can't tell "returned early" apart from
    // "threw and got caught". console.warn is what the catch block does with
    // a caught error, so it's the one signal that distinguishes them: this
    // guard existing means neither happens.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("gives up quietly when the fresh subscription has no endpoint", async () => {
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue({
        toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
      }),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up quietly when the fresh subscription's keys are incomplete", async () => {
    // public/sw.js:347 — `if (!keys.p256dh || !keys.auth) return;`. A pair of
    // half-keys is not a degraded Device, it is one that looks confirmed and
    // can never receive a push.
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue({
        endpoint: "https://new",
        toJSON: () => ({ keys: { p256dh: "p" } }),
      }),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up quietly when the fresh subscription has no toJSON at all", async () => {
    // `(fresh.toJSON && fresh.toJSON().keys) || {}` — the `{}` fallback.
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue({ endpoint: "https://new" }),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Offline-cache mirror. The fetch-strategy branches are not driven here (the
// pure mirror lib/offline.ts is), but the things that MUST move together —
// the cover matcher and the store names / caps that mirror cacheNames() and
// CACHE_ENTRY_LIMITS — are pinned on the source text so a change to one
// without the other fails.
// ---------------------------------------------------------------------------

describe("offline cache mirror of lib/offline.ts", () => {
  it("matches the trip cover route, but as network-first while attachments are cache-first (ADR 0043, amended 2026-10-02)", () => {
    expect(SW_SOURCE).toContain("function isCoverRoute(url)");
    expect(SW_SOURCE).toContain("/^\\/api\\/trips\\/[^/]+\\/cover$/");
    expect(SW_SOURCE).toContain("if (isAttachmentRoute(url)) return 'cache-first';");
    expect(SW_SOURCE).toContain("if (isCoverRoute(url)) return 'network-first';");
  });

  it("names its stores exactly as cacheNames() / CACHE_ENTRY_LIMITS do (spec 2026-10-06 §T)", () => {
    expect(SW_SOURCE).toContain("const CACHE_NAMES = { static: 'teepee-static-' + BUILD_ID, pages: 'teepee-pages-v1', files: 'teepee-files-v1' };");
    expect(SW_SOURCE).toContain("const CACHE_ENTRY_LIMITS = { static: 300, pages: 400, files: null };");
    expect(SW_SOURCE).not.toContain("CACHE_VERSION");
  });
});

function fakeCaches() {
  const stores = new Map<string, { keys: Request[] }>();
  const open = vi.fn(async (name: string) => {
    if (!stores.has(name)) stores.set(name, { keys: [] });
    const s = stores.get(name)!;
    return {
      put: vi.fn(async (req: Request) => { s.keys.push(req); }),
      keys: vi.fn(async () => [...s.keys]),
      delete: vi.fn(async (req: Request) => { s.keys = s.keys.filter((k) => k !== req); return true; }),
      addAll: vi.fn(async () => {}),
    };
  });
  return {
    stores,
    api: {
      open,
      keys: vi.fn(async () => [...stores.keys()]),
      delete: vi.fn(async (name: string) => stores.delete(name)),
      match: vi.fn(async () => undefined),
    },
  };
}

describe("public/sw.js — cache bounds (spec 2026-10-06 §T)", () => {
  it("never answers RSC or prefetch requests from the cache", () => {
    const { dispatch } = loadServiceWorker({ caches: fakeCaches().api });
    const respondWith = vi.fn();
    dispatch("fetch", { request: new Request("https://teepee.example/trips/x/plan?_rsc=1", { headers: { RSC: "1" } }), respondWith });
    dispatch("fetch", { request: new Request("https://teepee.example/trips/x/plan", { headers: { "Next-Router-Prefetch": "1" } }), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("caches a static chunk in this build's static store", async () => {
    const c = fakeCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("js"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: new Request("https://teepee.example/_next/static/chunks/a.js"), respondWith: (p: Promise<Response>) => { answered = p; } });
    await answered;
    await new Promise((r) => setTimeout(r, 0));
    expect(c.stores.get("teepee-static-b1")?.keys).toHaveLength(1);
  });

  it("trims the pages store to 400 entries, oldest first", async () => {
    const c = fakeCaches();
    const pages = await c.api.open("teepee-pages-v1");
    for (let i = 0; i < 400; i++) await pages.put(new Request(`https://teepee.example/p/${i}`));
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("<html>"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: new Request("https://teepee.example/trips/x/plan"), respondWith: (p: Promise<Response>) => { answered = p; } });
    await answered;
    await new Promise((r) => setTimeout(r, 0));
    const keys = c.stores.get("teepee-pages-v1")!.keys;
    expect(keys).toHaveLength(400);
    expect(keys[0].url).toBe("https://teepee.example/p/1");
  });

  it("never trims /offline.html out of the static store, even when it is the oldest entry", async () => {
    const c = fakeCaches();
    const statics = await c.api.open("teepee-static-b1");
    await statics.put(new Request("https://teepee.example/offline.html"));
    for (let i = 0; i < 299; i++) await statics.put(new Request(`https://teepee.example/_next/static/chunks/${i}.js`));
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("js"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: new Request("https://teepee.example/_next/static/chunks/new.js"), respondWith: (p: Promise<Response>) => { answered = p; } });
    await answered;
    await new Promise((r) => setTimeout(r, 0));
    const urls = c.stores.get("teepee-static-b1")!.keys.map((k) => k.url);
    expect(urls).toHaveLength(300);
    expect(urls).toContain("https://teepee.example/offline.html");
    expect(urls).not.toContain("https://teepee.example/_next/static/chunks/0.js");
  });

  it("activate deletes old builds' and the pre-split caches", async () => {
    const c = fakeCaches();
    for (const n of ["trip-planner-v6", "teepee-static-old", "teepee-static-b1", "teepee-pages-v1"]) await c.api.open(n);
    const { dispatch } = loadServiceWorker({ caches: c.api });
    await dispatch("activate", {});
    expect([...c.stores.keys()].sort()).toEqual(["teepee-pages-v1", "teepee-static-b1"]);
  });
});
