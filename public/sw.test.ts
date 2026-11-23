import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { META_CACHE_NAME, BUILD_META_PATH, LAST_TRIP_PATH, NAVIGATION_TIMEOUT_MS, SAVED_COPY_HEADER, SAVED_COPY_MESSAGE, WAS_SAVED_COPY_MESSAGE, SAVED_COPY_RECORD_TTL_MS, SAVED_COPY_RECORD_LIMIT } from "../lib/offline";
import { RESERVED_TRIP_SLUGS } from "../lib/trip-slug";

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
  const getClient = vi.fn().mockResolvedValue(undefined);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);

  const self = {
    addEventListener(type: string, cb: Listener) {
      const existing = listeners.get(type) ?? [];
      existing.push(cb);
      listeners.set(type, existing);
    },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim, get: getClient },
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
    Response,
    Headers,
    // Forwarded per call, like fetch below, so vi.useFakeTimers() reaches the worker.
    setTimeout: (...args: Parameters<typeof setTimeout>) => globalThis.setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
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

  return { dispatch, self, showNotification, matchAll, openWindow, getClient };
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
    expect(SW_SOURCE).toContain("/^\\/api\\/trips\\/[^/]+\\/(cover|route-snapshot)$/");
    expect(SW_SOURCE).toContain("if (isAttachmentRoute(url)) return 'cache-first';");
    expect(SW_SOURCE).toContain("if (isCoverRoute(url)) return 'network-first';");
  });

  it("names its stores exactly as cacheNames() / CACHE_ENTRY_LIMITS do (spec 2026-10-06 §T)", () => {
    expect(SW_SOURCE).toContain("const CACHE_NAMES = { static: 'teepee-static-' + BUILD_ID, pages: 'teepee-pages-v1', files: 'teepee-files-v1' };");
    expect(SW_SOURCE).toContain("const CACHE_ENTRY_LIMITS = { static: 300, pages: 400, files: null };");
    expect(SW_SOURCE).not.toContain("CACHE_VERSION");
    expect(SW_SOURCE).toContain(`const META_CACHE_NAME = '${META_CACHE_NAME}';`);
    expect(SW_SOURCE).toContain(`const BUILD_META_PATH = '${BUILD_META_PATH}';`);
    expect(SW_SOURCE).toContain(`const LAST_TRIP_PATH = '${LAST_TRIP_PATH}';`);
  });

  it("picks the offline start exactly as lib/offline.ts does (spec 2026-11-17 §A1)", () => {
    expect(SW_SOURCE).toContain("function isCachedTripHome(path)");
    expect(SW_SOURCE).toContain("/^\\/trips\\/([^/?#]+)$/");
    expect(SW_SOURCE).toContain(`const RESERVED_TRIP_SLUGS = [${[...RESERVED_TRIP_SLUGS].map((s) => `'${s}'`).join(", ")}];`);
    expect(SW_SOURCE).toContain("function pickOfflineStart(cachedUrls, lastTripPath)");
    expect(SW_SOURCE).toContain("function lastTripMessagePath(data)");
  });

  it("redirects an unsaved query to the saved page exactly as lib/offline.ts does (ADR 0077)", () => {
    expect(SW_SOURCE).toContain("function queryFallbackPath(url, mode, exactServable, plainServable) {\n  if (mode !== 'navigate' || exactServable || !plainServable) return null;\n  const { pathname, search } = new URL(url);\n  return search ? pathname : null;\n}");
  });

  it("answers a slow navigation from its saved copy exactly as lib/offline.ts does (spec 2026-11-17 §A5, ADR 0077)", () => {
    expect(SW_SOURCE).toContain(`const NAVIGATION_TIMEOUT_MS = ${NAVIGATION_TIMEOUT_MS};`);
    expect(SW_SOURCE).toContain(`const SAVED_COPY_HEADER = '${SAVED_COPY_HEADER}';`);
    expect(SW_SOURCE).toContain(`const SAVED_COPY_MESSAGE = '${SAVED_COPY_MESSAGE}';`);
    expect(SW_SOURCE).toContain("function isServerFailure(status) {\n  return status >= 500;\n}");
    expect(SW_SOURCE).toContain("function savedCopyResponse(response)");
    expect(SW_SOURCE).toContain("headers.set(SAVED_COPY_HEADER, '1');");
    expect(SW_SOURCE).toContain("function shouldStoreResponse(bytesRequested, response) {\n  return response.ok && !(bytesRequested && response.redirected);\n}");
    expect(SW_SOURCE).toContain("function savedCopyMessage(url) {\n  return { type: SAVED_COPY_MESSAGE, url };\n}");
    expect(SW_SOURCE).toContain(`const WAS_SAVED_COPY_MESSAGE = '${WAS_SAVED_COPY_MESSAGE}';`);
    expect(SW_SOURCE).toContain(`const SAVED_COPY_RECORD_TTL_MS = ${SAVED_COPY_RECORD_TTL_MS};`);
    expect(SW_SOURCE).toContain(`const SAVED_COPY_RECORD_LIMIT = ${SAVED_COPY_RECORD_LIMIT};`);
    expect(SW_SOURCE).toContain("function withSavedCopyRecord(records, path, now) {\n  const live = records.filter((r) => r.path !== path && now - r.at < SAVED_COPY_RECORD_TTL_MS);\n  return [...live, { path, at: now }].slice(-SAVED_COPY_RECORD_LIMIT);\n}");
    expect(SW_SOURCE).toContain("function withoutSavedCopyRecord(records, path) {\n  return records.filter((r) => r.path !== path);\n}");
    expect(SW_SOURCE).toContain("function wasSavedCopy(records, path, now) {\n  return records.some((r) => r.path === path && now - r.at < SAVED_COPY_RECORD_TTL_MS);\n}");
    expect(SW_SOURCE).toContain("function wasSavedCopyQueryPath(data)");
    expect(SW_SOURCE).toContain("return data.type === WAS_SAVED_COPY_MESSAGE && typeof data.url === 'string' ? data.url : null;");
  });
});

function fakeCaches() {
  const stores = new Map<string, { keys: Request[]; bodies: Map<string, Response> }>();
  const urlOf = (req: Request | string) => (typeof req === "string" ? new URL(req, "https://teepee.example").href : req.url);
  const open = vi.fn(async (name: string) => {
    if (!stores.has(name)) stores.set(name, { keys: [], bodies: new Map() });
    const s = stores.get(name)!;
    return {
      put: vi.fn(async (req: Request | string, res?: Response) => {
        const r = typeof req === "string" ? new Request(urlOf(req)) : req;
        s.keys = s.keys.filter((k) => k.url !== r.url);
        s.keys.push(r);
        if (res) s.bodies.set(r.url, res);
      }),
      match: vi.fn(async (req: Request | string) => s.bodies.get(urlOf(req))?.clone()),
      keys: vi.fn(async () => [...s.keys]),
      delete: vi.fn(async (req: Request | string) => {
        const url = urlOf(req);
        s.keys = s.keys.filter((k) => k.url !== url);
        s.bodies.delete(url);
        return true;
      }),
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
    expect([...c.stores.keys()].sort()).toEqual(["teepee-meta-v1", "teepee-pages-v1", "teepee-static-b1"]);
  });

  it("activate keeps the previous build's static store and deletes only older ones", async () => {
    const c = fakeCaches();
    for (const n of ["teepee-static-b0", "teepee-static-b1", "teepee-pages-v1", "teepee-files-v1"]) await c.api.open(n);

    // b1 was the build that last activated…
    await loadServiceWorker({ caches: c.api, href: "https://teepee.example/sw.js?build=b1" }).dispatch("activate", {});
    expect(c.stores.has("teepee-static-b0")).toBe(false);

    // …b0 comes back as an older build's store, then b2 deploys.
    await c.api.open("teepee-static-b0");
    await c.api.open("teepee-static-b2");
    await loadServiceWorker({ caches: c.api, href: "https://teepee.example/sw.js?build=b2" }).dispatch("activate", {});

    expect([...c.stores.keys()].sort()).toEqual([
      "teepee-files-v1",
      "teepee-meta-v1",
      "teepee-pages-v1",
      "teepee-static-b1",
      "teepee-static-b2",
    ]);
    const meta = await (await c.api.open("teepee-meta-v1")).match("/__teepee/build-meta");
    expect(await meta!.json()).toEqual({ build: "b2", previous: "b1" });
  });

  it("re-activating the same build keeps its recorded previous build", async () => {
    const c = fakeCaches();
    await c.api.open("teepee-static-b1");
    await loadServiceWorker({ caches: c.api, href: "https://teepee.example/sw.js?build=b1" }).dispatch("activate", {});
    await c.api.open("teepee-static-b2");
    await loadServiceWorker({ caches: c.api, href: "https://teepee.example/sw.js?build=b2" }).dispatch("activate", {});
    await loadServiceWorker({ caches: c.api, href: "https://teepee.example/sw.js?build=b2" }).dispatch("activate", {});
    expect(c.stores.has("teepee-static-b1")).toBe(true);
  });
});

function redirectedResponse(body: string) {
  const res = new Response(body, { status: 200, headers: { "Content-Type": "application/pdf" } });
  Object.defineProperty(res, "redirected", { value: true });
  const clone = res.clone.bind(res);
  res.clone = () => {
    const copy = clone();
    Object.defineProperty(copy, "redirected", { value: true });
    return copy;
  };
  return res;
}

describe("public/sw.js — redirected responses", () => {
  // undici refuses mode "navigate" on a constructed Request, so a navigation is faked.
  const navigation = (url: string) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });

  it("stores a clean copy of a redirected response", async () => {
    const c = fakeCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(redirectedResponse("pdf-bytes"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: new Request("https://teepee.example/api/attachments/a1"), respondWith: (p: Promise<Response>) => { answered = p; } });
    await answered;
    await new Promise((r) => setTimeout(r, 0));
    const stored = c.stores.get("teepee-files-v1")!.bodies.get("https://teepee.example/api/attachments/a1")!;
    expect(stored.redirected).toBe(false);
    expect(stored.headers.get("Content-Type")).toBe("application/pdf");
    expect(await stored.text()).toBe("pdf-bytes");
  });

  it("a redirected cached entry is not returned to a navigation", async () => {
    const c = fakeCaches();
    const url = "https://teepee.example/api/attachments/a1";
    const files = await c.api.open("teepee-files-v1");
    const request = navigation(url);
    await files.put(request as unknown as Request, redirectedResponse("stale"));
    c.api.match = vi.fn(async () => c.stores.get("teepee-files-v1")!.bodies.get(url)) as never;
    const deleted: unknown[] = [];
    const open = c.api.open;
    c.api.open = vi.fn(async (name: string) => {
      const cache = await open(name);
      return { ...cache, delete: vi.fn(async (req: unknown) => { deleted.push(req); return cache.delete(req as Request); }) };
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response("fresh"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request, respondWith: (p: Promise<Response>) => { answered = p; } });
    const response = await answered!;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("fresh");
    expect(deleted).toEqual([request]);
  });
});

function matchingCaches() {
  const c = fakeCaches();
  c.api.match = vi.fn(async (req: Request | string) => {
    const url = typeof req === "string" ? new URL(req, "https://teepee.example").href : req.url;
    for (const s of c.stores.values()) {
      const hit = s.bodies.get(url);
      if (hit) return hit.clone();
    }
    return undefined;
  }) as never;
  return c;
}

describe("public/sw.js — files saved for offline as bytes (spec A2)", () => {
  async function fetchThrough(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, url: string) {
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: new Request(url), respondWith: (p: Promise<Response>) => { answered = p; } });
    const response = await answered!;
    await new Promise((r) => setTimeout(r, 0));
    return response;
  }

  it("an offline=1 attachment fetch is cached under the plain URL", async () => {
    const c = matchingCaches();
    const fetchMock = vi.fn().mockResolvedValue(new Response("pdf-bytes", { headers: { "Content-Type": "application/pdf" } }));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await fetchThrough(dispatch, "https://teepee.example/api/attachments/a1?offline=1");

    expect((fetchMock.mock.calls[0][0] as Request).url).toBe("https://teepee.example/api/attachments/a1?offline=1");
    const files = c.stores.get("teepee-files-v1")!;
    expect(files.keys.map((k) => k.url)).toEqual(["https://teepee.example/api/attachments/a1"]);
    expect(await files.bodies.get("https://teepee.example/api/attachments/a1")!.text()).toBe("pdf-bytes");
  });

  it("an offline=1 response that came back redirected is returned but never stored", async () => {
    const c = matchingCaches();
    const fetchMock = vi.fn().mockResolvedValue(redirectedResponse("login-page"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await fetchThrough(dispatch, "https://teepee.example/api/attachments/a1?offline=1");
    expect(await response.text()).toBe("login-page");
    expect(c.stores.get("teepee-files-v1")?.keys ?? []).toEqual([]);

    fetchMock.mockResolvedValue(new Response("pdf-bytes"));
    const later = await fetchThrough(dispatch, "https://teepee.example/api/attachments/a1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await later.text()).toBe("pdf-bytes");
  });

  it("an offline=1 response that is not ok is never stored", async () => {
    const c = matchingCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await fetchThrough(dispatch, "https://teepee.example/api/attachments/a1?offline=1");

    expect(c.stores.get("teepee-files-v1")?.keys ?? []).toEqual([]);
  });

  it("a later plain request is a cache hit", async () => {
    const c = matchingCaches();
    const fetchMock = vi.fn().mockResolvedValue(new Response("pdf-bytes"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await fetchThrough(dispatch, "https://teepee.example/api/attachments/a1?offline=1");
    const response = await fetchThrough(dispatch, "https://teepee.example/api/attachments/a1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("pdf-bytes");
  });

  it("an offline=1 fetch ignores a redirected entry left by older code and overwrites it with real bytes", async () => {
    const c = matchingCaches();
    const plain = "https://teepee.example/api/attachments/a1";
    const files = await c.api.open("teepee-files-v1");
    await files.put(new Request(plain), redirectedResponse("stale"));
    const fetchMock = vi.fn().mockResolvedValue(new Response("pdf-bytes"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await fetchThrough(dispatch, `${plain}?offline=1`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("pdf-bytes");
    const stored = c.stores.get("teepee-files-v1")!.bodies.get(plain)!;
    expect(stored.redirected).toBe(false);
    expect(await stored.text()).toBe("pdf-bytes");
  });

  it("an offline=1 cover fetch is stored under its plain URL, keeping v, and answers the plain URL offline", async () => {
    const c = matchingCaches();
    const fetchMock = vi.fn().mockResolvedValue(new Response("jpg-bytes"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });
    const plain = "https://teepee.example/api/trips/t1/cover?v=trips%2Ft1%2Fc.jpg&w=480";

    await fetchThrough(dispatch, `${plain}&offline=1`);
    expect(c.stores.get("teepee-files-v1")!.keys.map((k) => k.url)).toEqual([plain]);

    fetchMock.mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await fetchThrough(dispatch, plain);
    expect(await response.text()).toBe("jpg-bytes");
  });

  it("stores each shape and pin set under its own URL in the files store", async () => {
    const c = matchingCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("png-bytes"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    const a = "https://teepee.example/api/trips/t1/route-snapshot?shape=tall&p=1%2C2%2C0%2C1";
    const b = "https://teepee.example/api/trips/t1/route-snapshot?shape=tall&p=1%2C3%2C0%2C1";

    await fetchThrough(dispatch, a);
    await fetchThrough(dispatch, b);
    expect(c.stores.get("teepee-files-v1")!.keys.map((k) => k.url)).toEqual([a, b]);
  });
});

describe("public/sw.js — opening the app offline (spec A1)", () => {
  // undici refuses mode "navigate" on a constructed Request, so a navigation is faked.
  const navigation = (url: string) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });

  async function navigate(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, url: string) {
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: navigation(url), respondWith: (p: Promise<Response>) => { answered = p; } });
    const response = await answered!;
    await new Promise((r) => setTimeout(r, 0));
    return response;
  }

  async function savePages(c: ReturnType<typeof fakeCaches>, pages: Record<string, string>) {
    const store = await c.api.open("teepee-pages-v1");
    for (const [path, body] of Object.entries(pages)) {
      await store.put(new Request(`https://teepee.example${path}`), new Response(body));
    }
  }

  function goOffline() {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  }

  it("offline navigation to / redirects to the cached Trip Home", async () => {
    const c = matchingCaches();
    await savePages(c, { "/": "landing", "/trips/a/budget": "money", "/trips/a": "trip-home", "/trips": "trips-list" });
    goOffline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await navigate(dispatch, "https://teepee.example/");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://teepee.example/trips/a");
  });

  it("offline navigation to a cached Trip Home serves its body", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a": "trip-home" });
    goOffline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await navigate(dispatch, "https://teepee.example/trips/a");

    expect(await response.text()).toBe("trip-home");
  });

  it("the navigation that follows the offline redirect reads the cache without asking the network again", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a": "trip-home" });
    goOffline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await navigate(dispatch, "https://teepee.example/");
    const response = await navigate(dispatch, "https://teepee.example/trips/a");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("trip-home");
    await navigate(dispatch, "https://teepee.example/trips/a");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("a picked Trip page that can no longer answer a navigation is dropped and the next one is picked", async () => {
    const c = matchingCaches();
    await savePages(c, { "/": "landing", "/trips/a": "a-home" });
    const pages = await c.api.open("teepee-pages-v1");
    await pages.put(new Request("https://teepee.example/trips/b"), redirectedResponse("stale"));
    goOffline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await navigate(dispatch, "https://teepee.example/");

    expect(response.headers.get("Location")).toBe("https://teepee.example/trips/a");
    expect(c.stores.get("teepee-pages-v1")!.keys.map((k) => k.url)).not.toContain("https://teepee.example/trips/b");
  });

  it("offline navigation to / with nothing saved serves offline.html", async () => {
    const c = matchingCaches();
    const statics = await c.api.open("teepee-static-b1");
    await statics.put(new Request("https://teepee.example/offline.html"), new Response("offline-page"));
    goOffline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await navigate(dispatch, "https://teepee.example/");

    expect(await response.text()).toBe("offline-page");
  });

  it("offline navigation to / opens the Trip Home last served from the network", async () => {
    const c = matchingCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("b-home"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    await navigate(dispatch, "https://teepee.example/trips/b");
    await savePages(c, { "/trips/a": "a-home" });

    goOffline();
    const response = await navigate(dispatch, "https://teepee.example/");

    expect(response.headers.get("Location")).toBe("https://teepee.example/trips/b");
  });

  it("a LAST_TRIP message records a Trip Home path and ignores anything else", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a": "a-home", "/trips/b": "b-home" });
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await dispatch("message", { data: { type: "LAST_TRIP", path: "/trips/a" } });
    await dispatch("message", { data: { type: "LAST_TRIP", path: "/trips/b/budget" } });
    await dispatch("message", { data: { type: "LAST_TRIP", path: "/trips/b?x=1" } });
    await dispatch("message", { data: { type: "LAST_TRIP", path: "https://elsewhere.example/trips/b" } });

    const hit = await (await c.api.open(META_CACHE_NAME)).match(LAST_TRIP_PATH);
    expect(await hit!.text()).toBe("/trips/a");
    goOffline();
    const response = await navigate(dispatch, "https://teepee.example/");
    expect(response.headers.get("Location")).toBe("https://teepee.example/trips/a");
  });

  it("records only a Trip Home navigation that came back ok from the network", async () => {
    const c = matchingCaches();
    const fetchMock = vi.fn().mockResolvedValue(new Response("page"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });
    const lastTrip = async () => {
      const hit = await (await c.api.open(META_CACHE_NAME)).match(LAST_TRIP_PATH);
      return hit ? hit.text() : null;
    };

    await navigate(dispatch, "https://teepee.example/trips/a");
    await navigate(dispatch, "https://teepee.example/trips/a/budget");
    await navigate(dispatch, "https://teepee.example/trips/new");
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: new Request("https://teepee.example/trips/b"), respondWith: (p: Promise<Response>) => { answered = p; } });
    await answered;
    await new Promise((r) => setTimeout(r, 0));
    fetchMock.mockResolvedValueOnce(new Response("gone", { status: 404 }));
    await navigate(dispatch, "https://teepee.example/trips/c");
    expect(await lastTrip()).toBe("/trips/a");

    goOffline();
    await navigate(dispatch, "https://teepee.example/trips/b");
    expect(await lastTrip()).toBe("/trips/a");
  });
});

describe("public/sw.js — a slow network falls back to the saved copy (spec A5)", () => {
  // undici refuses mode "navigate" on a constructed Request, so a navigation is faked.
  const navigation = (url: string) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });
  const PLAN = "https://teepee.example/trips/a/plan";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function savePages(c: ReturnType<typeof fakeCaches>, pages: Record<string, string>) {
    const store = await c.api.open("teepee-pages-v1");
    for (const [path, body] of Object.entries(pages)) {
      await store.put(new Request(`https://teepee.example${path}`), new Response(body));
    }
  }

  function slowNetwork() {
    const pending: { resolve: (r: Response) => void; reject: (e: unknown) => void }[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve, reject) => pending.push({ resolve, reject })));
    globalThis.fetch = fetchMock as never;
    return {
      fetchMock,
      land: (response: Response) => pending.shift()!.resolve(response),
      fail: (err: unknown) => pending.shift()!.reject(err),
    };
  }

  function open(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, request: unknown) {
    let answered: Promise<Response> | undefined;
    let settled: Response | undefined;
    const waits: Promise<unknown>[] = [];
    dispatch("fetch", {
      request,
      resultingClientId: "client-1",
      respondWith: (p: Promise<Response>) => {
        answered = p;
      },
      waitUntil: (p: Promise<unknown>) => {
        waits.push(p);
      },
    });
    answered!.then((r) => {
      settled = r;
    });
    return { answered: answered!, settled: () => settled, waits };
  }

  async function settle(waits: Promise<unknown>[]) {
    let seen = -1;
    while (seen !== waits.length) {
      seen = waits.length;
      await Promise.all(waits);
    }
  }

  function withClient(getClient: ReturnType<typeof vi.fn>) {
    const postMessage = vi.fn();
    getClient.mockResolvedValue({ postMessage });
    return postMessage;
  }

  it("a navigation slower than 4s is answered from the cache", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    slowNetwork();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = withClient(getClient);

    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1);
    expect(nav.settled()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    const response = await nav.answered;
    expect(await response.text()).toBe("saved-plan");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    await vi.advanceTimersByTimeAsync(0);
    expect(getClient).toHaveBeenCalledWith("client-1");
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: PLAN });
  });

  it("the slow fetch still refreshes the cache when it lands", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    const network = slowNetwork();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    withClient(getClient);

    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    expect(await (await nav.answered).text()).toBe("saved-plan");

    network.land(new Response("fresh-plan"));
    await settle(nav.waits);

    const stored = c.stores.get("teepee-pages-v1")!.bodies.get(PLAN)!;
    expect(await stored.clone().text()).toBe("fresh-plan");
  });

  it("a slow fetch that fails after the saved copy is shown is swallowed", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    const network = slowNetwork();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    withClient(getClient);

    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    await nav.answered;
    network.fail(new TypeError("network lost"));

    await expect(settle(nav.waits)).resolves.toBeUndefined();
    expect(await c.stores.get("teepee-pages-v1")!.bodies.get(PLAN)!.clone().text()).toBe("saved-plan");
  });

  it("a 503 with a cached copy serves the cached copy", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("down", { status: 503 }));
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = withClient(getClient);

    const nav = open(dispatch, navigation(PLAN));
    const response = await nav.answered;
    await settle(nav.waits);

    expect(await response.text()).toBe("saved-plan");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: PLAN });
    expect(await c.stores.get("teepee-pages-v1")!.bodies.get(PLAN)!.clone().text()).toBe("saved-plan");
  });

  it("a 503 with no cached copy is returned as-is", async () => {
    const c = matchingCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("down", { status: 503 }));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, navigation(PLAN)).answered;

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("down");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBeNull();
  });

  it("a 404 is returned as-is even with a cached copy", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("gone", { status: 404 }));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, navigation(PLAN)).answered;

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("gone");
  });

  it("a redirect from the network is returned as-is even with a cached copy", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://teepee.example/" } }));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, navigation(PLAN)).answered;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://teepee.example/");
  });

  it("a fast response is never delayed or replaced", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("fresh-plan"));
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = withClient(getClient);

    const response = await open(dispatch, navigation(PLAN)).answered;

    expect(await response.text()).toBe("fresh-plan");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("a slow navigation with nothing saved waits for the network", async () => {
    const c = matchingCaches();
    const statics = await c.api.open("teepee-static-b1");
    await statics.put(new Request("https://teepee.example/offline.html"), new Response("offline-page"));
    const network = slowNetwork();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 3);
    expect(nav.settled()).toBeUndefined();
    network.land(new Response("fresh-plan"));

    expect(await (await nav.answered).text()).toBe("fresh-plan");
  });

  it("a redirected cached entry is never served on a timeout", async () => {
    const c = matchingCaches();
    const pages = await c.api.open("teepee-pages-v1");
    await pages.put(new Request(PLAN), redirectedResponse("stale"));
    const network = slowNetwork();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 3);
    expect(nav.settled()).toBeUndefined();
    network.land(new Response("fresh-plan"));

    expect(await (await nav.answered).text()).toBe("fresh-plan");
  });

  it("a non-navigation GET waits for the network as before", async () => {
    const c = matchingCaches();
    const cover = "https://teepee.example/api/trips/t1/cover?v=k";
    const files = await c.api.open("teepee-files-v1");
    await files.put(new Request(cover), new Response("saved-cover"));
    const network = slowNetwork();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const req = open(dispatch, new Request(cover));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 3);
    expect(req.settled()).toBeUndefined();
    network.land(new Response("fresh-cover"));

    const response = await req.answered;
    expect(await response.text()).toBe("fresh-cover");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBeNull();
  });

  it("a slow navigation to / opens the saved Trip, and the page it lands on is the saved copy at once", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a": "trip-home" });
    const network = slowNetwork();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = withClient(getClient);

    const landing = open(dispatch, navigation("https://teepee.example/"));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    const redirect = await landing.answered;
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("https://teepee.example/trips/a");

    const home = open(dispatch, navigation("https://teepee.example/trips/a"));
    const response = await home.answered;
    await settle(home.waits);

    expect(network.fetchMock).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("trip-home");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: "https://teepee.example/trips/a" });
  });

  it("a slow / that the network answers in time leaves the next Trip Home navigation to the network", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a": "trip-home" });
    const fetchMock = vi.fn().mockResolvedValue(new Response("fresh"));
    globalThis.fetch = fetchMock;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await open(dispatch, navigation("https://teepee.example/")).answered;
    const response = await open(dispatch, navigation("https://teepee.example/trips/a")).answered;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await response.text()).toBe("fresh");
  });

  it("the saved copy is announced once the page that opened it exists", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    slowNetwork();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = vi.fn();
    getClient.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValue({ postMessage });

    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    await nav.answered;
    expect(postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: PLAN });
  });

  function ask(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, url: string) {
    const postMessage = vi.fn();
    dispatch("message", { data: { type: WAS_SAVED_COPY_MESSAGE, url }, ports: [{ postMessage }] });
    return postMessage;
  }

  it("answers the page's question: yes for a slow saved copy, no for a fresh one", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    slowNetwork();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    withClient(getClient);

    expect(ask(dispatch, "/trips/a/plan")).toHaveBeenCalledWith({ savedCopy: false });
    const nav = open(dispatch, navigation(PLAN));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    await nav.answered;

    expect(ask(dispatch, "/trips/a/plan")).toHaveBeenCalledWith({ savedCopy: true });
    expect(ask(dispatch, "/trips/a/budget")).toHaveBeenCalledWith({ savedCopy: false });
  });

  it("a copy served after the fetch was rejected is marked, announced and remembered", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = withClient(getClient);

    const nav = open(dispatch, navigation(PLAN));
    const response = await nav.answered;
    await settle(nav.waits);

    expect(await response.text()).toBe("saved-plan");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: PLAN });
    expect(ask(dispatch, "/trips/a/plan")).toHaveBeenCalledWith({ savedCopy: true });
  });

  it("a rejected non-navigation request answered from the cache is marked, but not announced", async () => {
    const c = matchingCaches();
    const cover = "https://teepee.example/api/trips/t1/cover?v=k";
    const files = await c.api.open("teepee-files-v1");
    await files.put(new Request(cover), new Response("saved-cover"));
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, new Request(cover)).answered;

    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(await response.text()).toBe("saved-cover");
  });

  it("offline /, then the Trip it opens, is marked as a saved copy", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a": "trip-home" });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = withClient(getClient);

    const redirect = await open(dispatch, navigation("https://teepee.example/")).answered;
    expect(redirect.status).toBe(302);
    const home = open(dispatch, navigation("https://teepee.example/trips/a"));
    const response = await home.answered;
    await settle(home.waits);

    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: "https://teepee.example/trips/a" });
    expect(ask(dispatch, "/trips/a")).toHaveBeenCalledWith({ savedCopy: true });
  });

  it("opening the same page again on a good connection forgets the record", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/plan": "saved-plan" });
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(new Response("fresh-plan"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    withClient(getClient);

    await open(dispatch, navigation(PLAN)).answered;
    expect(ask(dispatch, "/trips/a/plan")).toHaveBeenCalledWith({ savedCopy: true });
    const fresh = await open(dispatch, navigation(PLAN)).answered;

    expect(await fresh.text()).toBe("fresh-plan");
    expect(ask(dispatch, "/trips/a/plan")).toHaveBeenCalledWith({ savedCopy: false });
  });

  it("ignores a WAS_SAVED_COPY message with no port", () => {
    const { dispatch } = loadServiceWorker({ caches: matchingCaches().api });
    expect(() => dispatch("message", { data: { type: WAS_SAVED_COPY_MESSAGE, url: "/x" } })).not.toThrow();
  });
});

describe("public/sw.js — an unsaved query falls back to the saved page (ADR 0077)", () => {
  const navigation = (url: string) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });
  const BASE = "https://teepee.example/trips/a/budget";
  const QUERY = `${BASE}?by=place`;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function savePages(c: ReturnType<typeof fakeCaches>, pages: Record<string, string>) {
    const store = await c.api.open("teepee-pages-v1");
    for (const [path, body] of Object.entries(pages)) {
      await store.put(new Request(`https://teepee.example${path}`), new Response(body));
    }
  }

  function open(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, request: unknown) {
    let answered: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    dispatch("fetch", {
      request,
      resultingClientId: "client-1",
      respondWith: (p: Promise<Response>) => {
        answered = p;
      },
      waitUntil: (p: Promise<unknown>) => {
        waits.push(p);
      },
    });
    return { answered: answered!, waits };
  }

  async function settle(waits: Promise<unknown>[]) {
    let seen = -1;
    while (seen !== waits.length) {
      seen = waits.length;
      await Promise.all(waits);
    }
  }

  function offline() {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    globalThis.fetch = fetchMock as never;
    return fetchMock;
  }

  it("offline, a query on a saved page redirects to the plain path, which is then the saved copy with no second fetch", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/budget": "money" });
    const fetchMock = offline();
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });
    const postMessage = vi.fn();
    getClient.mockResolvedValue({ postMessage });

    const redirect = await open(dispatch, navigation(QUERY)).answered;
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe(BASE);

    const follow = open(dispatch, navigation(BASE));
    const response = await follow.answered;
    await settle(follow.waits);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("money");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(postMessage).toHaveBeenCalledWith({ type: SAVED_COPY_MESSAGE, url: BASE });
  });

  it("the exact URL, when saved, is served directly with no redirect", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/budget": "money", "/trips/a/budget?by=place": "money-by-place" });
    offline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, navigation(QUERY)).answered;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("money-by-place");
  });

  it("with neither saved, a query navigation gets offline.html", async () => {
    const c = matchingCaches();
    const statics = await c.api.open("teepee-static-dev");
    await statics.put(new Request("https://teepee.example/offline.html"), new Response("offline-page"));
    offline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, navigation(QUERY)).answered;

    expect(await response.text()).toBe("offline-page");
  });

  it("a slow network on a query navigation redirects the same way", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/budget": "money" });
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as never;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const nav = open(dispatch, navigation(QUERY));
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    const redirect = await nav.answered;

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe(BASE);
  });

  it("a 5xx on a query navigation redirects the same way", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/budget": "money" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 503 })) as never;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const redirect = await open(dispatch, navigation(QUERY)).answered;

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe(BASE);
  });

  it("a request that is not a navigation is never redirected", async () => {
    const c = matchingCaches();
    await savePages(c, { "/trips/a/budget": "money" });
    offline();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await open(dispatch, { url: QUERY, method: "GET", mode: "cors", headers: new Headers() }).answered;

    expect(response.status).toBe(503);
  });
});

describe("public/sw.js — sign-out keeps the offline page", () => {
  const navigation = (url: string) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });
  const OFFLINE_PAGE = "https://teepee.example/offline.html";
  const LAUNCH_PAGE = "https://teepee.example/launch.html";

  async function signedInCaches() {
    const c = matchingCaches();
    const statics = await c.api.open("teepee-static-b1");
    await statics.put(new Request(OFFLINE_PAGE), new Response("offline-page"));
    await statics.put(new Request(LAUNCH_PAGE), new Response("launch-page"));
    await statics.put(new Request("https://teepee.example/_next/static/chunks/a.js"), new Response("js"));
    await (await c.api.open("teepee-static-b0")).put(new Request("https://teepee.example/_next/static/chunks/old.js"), new Response("js"));
    await (await c.api.open("teepee-pages-v1")).put(new Request("https://teepee.example/trips/a"), new Response("trip-home"));
    await (await c.api.open("teepee-files-v1")).put(new Request("https://teepee.example/api/attachments/a1"), new Response("pdf"));
    const meta = await c.api.open(META_CACHE_NAME);
    await meta.put(BUILD_META_PATH, new Response(JSON.stringify({ build: "b1", previous: "b0" })));
    await meta.put(LAST_TRIP_PATH, new Response("/trips/a"));
    return c;
  }

  async function navigate(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, url: string) {
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request: navigation(url), respondWith: (p: Promise<Response>) => { answered = p; } });
    return answered!;
  }

  it("after CLEAR_CACHE an offline navigation to an unsaved page still serves offline.html", async () => {
    const c = await signedInCaches();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await dispatch("message", { data: { type: "CLEAR_CACHE" } });

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await navigate(dispatch, "https://teepee.example/trips/a");
    expect(await response.text()).toBe("offline-page");
  });

  it("clears every private entry and keeps only the offline page, the launch page and the build record", async () => {
    const c = await signedInCaches();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await dispatch("message", { data: { type: "CLEAR_CACHE" } });

    expect([...c.stores.keys()].sort()).toEqual([META_CACHE_NAME, "teepee-static-b1"]);
    expect(c.stores.get("teepee-static-b1")!.keys.map((k) => k.url)).toEqual([OFFLINE_PAGE, LAUNCH_PAGE]);
    const meta = c.stores.get(META_CACHE_NAME)!;
    expect(meta.keys.map((k) => new URL(k.url).pathname)).toEqual([BUILD_META_PATH]);
    expect(await meta.bodies.get(`https://teepee.example${BUILD_META_PATH}`)!.json()).toEqual({ build: "b1", previous: "b0" });
  });

  it("asks for the offline page again when the static store had lost it", async () => {
    const c = matchingCaches();
    const addAll = vi.fn(async () => {});
    const open = c.api.open;
    c.api.open = vi.fn(async (name: string) => ({ ...(await open(name)), addAll })) as never;
    await (await c.api.open("teepee-pages-v1")).put(new Request("https://teepee.example/trips/a"), new Response("trip-home"));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await dispatch("message", { data: { type: "CLEAR_CACHE" } });

    expect(addAll).toHaveBeenCalledWith(["/offline.html", "/launch.html"]);
    expect(c.stores.has("teepee-pages-v1")).toBe(false);
  });

  it("names the stores sign-out deletes exactly as lib/offline.ts does", () => {
    expect(SW_SOURCE).toContain("function signOutCacheNames(existing, buildId) {\n  const keep = new Set(['teepee-static-' + buildId, META_CACHE_NAME]);\n  return existing.filter((name) => !keep.has(name));\n}");
  });
});

describe("public/sw.js — a file is saved only once its bytes are stored", () => {
  const ATTACHMENT = "https://teepee.example/api/attachments/a1";

  function open(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, request: unknown) {
    let answered: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    dispatch("fetch", {
      request,
      respondWith: (p: Promise<Response>) => { answered = p; },
      waitUntil: (p: Promise<unknown>) => { waits.push(p); },
    });
    return { answered: answered!, waits };
  }

  // The real Cache reads the whole body before it keeps anything; the shared fake does not.
  function readingCaches() {
    const c = matchingCaches();
    const baseOpen = c.api.open;
    c.api.open = vi.fn(async (name: string) => {
      const cache = await baseOpen(name);
      return {
        ...cache,
        put: vi.fn(async (req: Request | string, res: Response) => {
          const bytes = await res.arrayBuffer();
          await cache.put(req, new Response(bytes, { headers: res.headers }));
        }),
      };
    }) as never;
    return c;
  }

  it("holds the worker open until the bytes are in the cache", async () => {
    const c = readingCaches();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("pdf-bytes"));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const file = open(dispatch, new Request(`${ATTACHMENT}?offline=1`));
    await file.answered;

    expect(file.waits).toHaveLength(1);
    await file.waits[0];
    expect(await c.stores.get("teepee-files-v1")!.bodies.get(ATTACHMENT)!.text()).toBe("pdf-bytes");
  });

  it("a body that errors mid-stream leaves nothing in the cache", async () => {
    const c = readingCaches();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent) return controller.error(new TypeError("connection lost"));
          sent = true;
          controller.enqueue(new TextEncoder().encode("half"));
        },
      });
      return new Response(body, { headers: { "Content-Length": "5000000" } });
    }) as never;
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const file = open(dispatch, new Request(`${ATTACHMENT}?offline=1`));
    const response = await file.answered;
    await expect(response.arrayBuffer()).rejects.toThrow();

    expect(file.waits).toHaveLength(1);
    await expect(file.waits[0]).resolves.toBeUndefined();
    expect(c.stores.get("teepee-files-v1")?.keys ?? []).toEqual([]);
  });

  it("a put that rejects leaves nothing in the cache and still answers the request", async () => {
    const c = matchingCaches();
    const baseOpen = c.api.open;
    c.api.open = vi.fn(async (name: string) => ({
      ...(await baseOpen(name)),
      put: vi.fn().mockRejectedValue(new DOMException("full", "QuotaExceededError")),
    })) as never;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("pdf-bytes"));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const file = open(dispatch, new Request(`${ATTACHMENT}?offline=1`));
    const response = await file.answered;

    expect(await response.text()).toBe("pdf-bytes");
    expect(file.waits).toHaveLength(1);
    await expect(file.waits[0]).resolves.toBeUndefined();
    expect(c.stores.get("teepee-files-v1")?.keys ?? []).toEqual([]);
  });
});

describe("public/sw.js — an uncached file opened offline", () => {
  const ATTACHMENT = "https://teepee.example/api/attachments/a1";

  async function answer(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, request: unknown) {
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request, respondWith: (p: Promise<Response>) => { answered = p; } });
    return answered!;
  }

  async function offlineWithOfflinePage() {
    const c = matchingCaches();
    await (await c.api.open("teepee-static-b1")).put(new Request("https://teepee.example/offline.html"), new Response("offline-page"));
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    return c;
  }

  it("as a navigation, is answered with offline.html", async () => {
    const c = await offlineWithOfflinePage();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await answer(dispatch, { url: ATTACHMENT, method: "GET", mode: "navigate", headers: new Headers() });

    expect(await response.text()).toBe("offline-page");
  });

  it("as an image or a fetch, still fails", async () => {
    const c = await offlineWithOfflinePage();
    const { dispatch } = loadServiceWorker({ caches: c.api });

    await expect(answer(dispatch, new Request(ATTACHMENT))).rejects.toThrow("offline");
  });
});

describe("public/sw.js — only a cache fallback is marked for a request that is not a navigation", () => {
  const PLAN = "https://teepee.example/trips/a/plan";

  async function answer(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, request: unknown) {
    let answered: Promise<Response> | undefined;
    dispatch("fetch", { request, respondWith: (p: Promise<Response>) => { answered = p; } });
    return answered!;
  }

  it("a page fetch the network answers carries no mark, even with an older copy saved", async () => {
    const c = matchingCaches();
    await (await c.api.open("teepee-pages-v1")).put(new Request(PLAN), new Response("old-plan"));
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("fresh-plan"));
    const { dispatch } = loadServiceWorker({ caches: c.api });

    const response = await answer(dispatch, new Request(PLAN));

    expect(await response.text()).toBe("fresh-plan");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBeNull();
  });

  it("a page fetch that fails on the network gets the older copy, marked", async () => {
    const c = matchingCaches();
    await (await c.api.open("teepee-pages-v1")).put(new Request(PLAN), new Response("old-plan"));
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { dispatch, getClient } = loadServiceWorker({ caches: c.api });

    const response = await answer(dispatch, new Request(PLAN));

    expect(await response.text()).toBe("old-plan");
    expect(response.headers.get(SAVED_COPY_HEADER)).toBe("1");
    expect(getClient).not.toHaveBeenCalled();
  });

  it("marks it in the one place a fallback is answered", () => {
    expect(SW_SOURCE).toContain("if (copy) return request.mode === 'navigate' ? announceSavedCopy(event, copy.cached) : savedCopyResponse(copy.cached);");
  });
});

describe("public/sw.js — the redirect to a saved page (R1-8)", () => {
  it("has no unused flag, and keys a cached file exactly as lib/offline.ts does", () => {
    expect(SW_SOURCE).toContain("function redirectToSavedTrip(path) {");
    expect(SW_SOURCE).not.toContain("redirect.savedCopy");
    expect(SW_SOURCE).toContain("function cacheKeyFor(request) {\n  if (cacheStoreFor(request.url) !== 'files') return request;\n  const key = fileCacheKey(request.url);\n  return key === request.url ? request : key;\n}");
  });
});

describe("public/sw.js — the launch page", () => {
  const navigation = (url: string) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });
  const LAUNCH = "https://teepee.example/launch.html";

  async function navigate(dispatch: (type: string, event: Record<string, unknown>) => Promise<unknown>, url: string) {
    let answered: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    dispatch("fetch", { request: navigation(url), respondWith: (p: Promise<Response>) => { answered = p; }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    return { response: await answered!, settled: () => Promise.all(waits) };
  }

  it("precaches /launch.html beside /offline.html", () => {
    expect(SW_SOURCE).toContain("const PRECACHE_URLS = ['/offline.html', '/launch.html'];");
    expect(SW_SOURCE).toContain("function isLaunchPage(url) {\n  try {\n    return new URL(url).pathname === '/launch.html';");
    expect(SW_SOURCE).toContain("if (isLaunchPage(url)) return 'cache-first';");
  });

  it("answers from this build's static store without touching the network, and without a saved-copy mark", async () => {
    const c = matchingCaches();
    await (await c.api.open("teepee-static-b0")).put(new Request(LAUNCH), new Response("old-launch"));
    await (await c.api.open("teepee-static-b1")).put(new Request(LAUNCH), new Response("new-launch"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));

    const { response } = await navigate(dispatch, LAUNCH);

    expect(await response.text()).toBe("new-launch");
    expect(response.headers.get("X-Teepee-Saved-Copy")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches and keeps it in the static store when this build has none yet", async () => {
    const c = matchingCaches();
    const { dispatch } = loadServiceWorker({ caches: c.api });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("fresh-launch"));

    const { response, settled } = await navigate(dispatch, LAUNCH);
    await settled();

    expect(await response.text()).toBe("fresh-launch");
    expect(c.stores.get("teepee-static-b1")!.keys.map((k) => k.url)).toEqual([LAUNCH]);
    expect(c.stores.has("teepee-pages-v1")).toBe(false);
  });

  it("offline, the hand-over to / still redirects to the saved Trip as before", async () => {
    const c = matchingCaches();
    await (await c.api.open("teepee-pages-v1")).put(new Request("https://teepee.example/trips/a"), new Response("trip-home"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { response } = await navigate(dispatch, "https://teepee.example/");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://teepee.example/trips/a");
  });

  it("is never trimmed out of the static store", async () => {
    const c = matchingCaches();
    const statics = await c.api.open("teepee-static-b1");
    await statics.put(new Request(LAUNCH), new Response("launch"));
    for (let i = 0; i < 305; i++) await statics.put(new Request(`https://teepee.example/_next/static/chunks/${i}.js`), new Response("js"));
    const { dispatch } = loadServiceWorker({ caches: c.api });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("js"));

    const { settled } = await navigate(dispatch, "https://teepee.example/_next/static/chunks/new.js");
    await settled();

    expect(c.stores.get("teepee-static-b1")!.keys.map((k) => k.url)).toContain(LAUNCH);
  });
});
