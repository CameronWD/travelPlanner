/**
 * Offline audit — `npm run audit:offline`. Proves the offline work (spec
 * 2026-11-17 A1, A2, A5, B1 to B3, C, D1, A3) against a real production build
 * with the service worker running, driven by Playwright with
 * context.setOffline(true). Nothing here is a unit test against a fake cache.
 *
 * PREREQUISITES
 *   - LOCAL Postgres with migrations applied and the demo seed loaded
 *     (npm run db:seed:demo): the audit signs in as you@example.com and uses
 *     the Travelling Trip "Great Ocean Road, right now".
 *   - `next build` then `next start -p 3100`, both with DATABASE_URL and
 *     DIRECT_URL on the command line pointing at localhost, ALLOW_DEV_LOGIN=true,
 *     STORAGE_DRIVER=local, APP_URL=http://localhost:3100, AUTH_SECRET=<anything>,
 *     and __NEXT_PROCESSED_ENV=true. That last one stops Next applying any .env*
 *     file, so .env.production.local can never point the build or server at a
 *     real database. The audit must see the same DATABASE_URL and AUTH_SECRET.
 *   - Playwright + Chromium (see nav-audit's header).
 *
 * WHY IT MINTS ITS OWN SESSION: the dev login is switched off whenever
 * NODE_ENV is production (lib/auth/auth.ts), and `next start` is always
 * production. So the audit inserts an AuthSession row for you@example.com in
 * the local database and sets the signed cookie itself (Better Auth signs
 * `token.HMAC-SHA256(secret)` and, in production, names the cookie
 * `__Secure-better-auth.session_token`, which Chromium accepts on localhost).
 * The row expires in 30 days so the sliding-session check (A3) can prove the
 * cookie is renewed out to 120.
 *
 * WHY IT RUNS THROUGH A PROXY: page.route()/context.route() never see the
 * fetches a service worker makes, so they cannot delay the worker's own
 * network request (which is what the 4-second timeout in public/sw.js races).
 * The audit therefore starts a tiny pass-through proxy in front of
 * `next start` and drives the browser through it; the proxy can hold document
 * requests for 6 seconds on demand. It forwards the Host header untouched.
 *
 * WHAT IT CHANGES AND WHAT PERSISTS (a second run starts from the same state):
 *   - Removed at the end, always: the AuthSession rows it inserted, and the two
 *     Attachment rows plus their `.uploads/` files it creates fresh each run
 *     (a PDF and a PNG, named audit-*-<run id>).
 *   - Persists on the demo Trip, by design and idempotent: today's Journal entry
 *     (overwritten each run with "Audit entry <run id>...") and one pre-trip
 *     Checklist item "Audit checklist item" (created only when missing). Both go
 *     away with `npm run db:seed:demo`, which recreates the demo Trips.
 *   - The Activity feed gains entries for those writes.
 *
 * Output: PASS/FAIL (or N/A where something cannot be observed locally) per
 * check, console errors and failed requests at the end. Screenshots go to
 * OFFLINE_AUDIT_OUT (default /tmp/offline-audit/<timestamp>; never inside the
 * repo). Exit code 0 only when no check FAILed.
 */

import http from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { BrowserContext, Page } from "playwright";
import { resolvePlaywright } from "./lib/audit-browser";
import { assertLocalBaseUrl, assertOutsideRepo } from "./layout-audit/config";

const DESKTOP = { width: 1100, height: 800 };
const PHONE = { width: 390, height: 844 };
const TRIP_NAME = "Great Ocean Road, right now";
const SESSION_COOKIE = "__Secure-better-auth.session_token";
const DAY_MS = 86_400_000;
const SAVED_COPY = /Saved copy\. Reload when you.re back online/;
const OFFLINE_MESSAGE = /You.re offline\. Plan changes need a connection/;
const SLOW_BOUND_MS = 5_000;

const PDF_BODY = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const PNG_BODY = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Result = { name: string; status: "PASS" | "FAIL" | "N/A"; detail: string };
type Phase = "setup" | "online" | "offline" | "slow" | "phone" | "plan";

const results: Result[] = [];
const consoleErrors: { phase: Phase; url: string; text: string }[] = [];
const failedRequests: { phase: Phase; url: string; failure: string }[] = [];
let phase: Phase = "setup";
let outDir = "";

function record(name: string, ok: boolean, detail: string, notObservable = false): boolean {
  const status = notObservable ? "N/A" : ok ? "PASS" : "FAIL";
  results.push({ name, status, detail });
  console.log(`${status.padEnd(4)}  ${name} — ${detail}`);
  return ok;
}

function watch(page: Page): void {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push({ phase, url: page.url(), text: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) => consoleErrors.push({ phase, url: page.url(), text: `pageerror: ${e.message.slice(0, 300)}` }));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.status() !== 503) failedRequests.push({ phase, url: r.url(), failure: `HTTP ${r.status()}` });
  });
  page.on("requestfailed", (r) => failedRequests.push({ phase, url: r.url(), failure: r.failure()?.errorText ?? "failed" }));
}

async function shot(page: Page, label: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${label.replace(/[^a-z0-9]+/gi, "-")}.png`) }).catch(() => {});
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function poll<T>(read: () => Promise<T | null | false | undefined>, timeoutMs: number, everyMs = 250): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await read().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(everyMs);
  }
}

async function phaseRun(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    record(`${label}: phase aborted`, false, e instanceof Error ? e.message.split("\n")[0] : String(e));
  }
}

function startProxy(upstream: URL, hold: { ms: number; held: number }): Promise<{ origin: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const isDocument = req.method === "GET" && !req.headers.rsc && (req.headers.accept ?? "").includes("text/html");
    const forward = () => {
      const out = http.request({ host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: req.headers }, (back) => {
        res.writeHead(back.statusCode ?? 502, back.headers);
        back.pipe(res);
      });
      out.on("error", () => res.destroy());
      req.pipe(out);
    };
    if (isDocument && hold.ms > 0) {
      hold.held += 1;
      setTimeout(forward, hold.ms);
    } else forward();
  });
  return new Promise((resolve) => {
    server.listen(0, "localhost", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        origin: `http://localhost:${port}`,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      });
    });
  });
}

// Every refusal happens here, before anything is opened or started.
function preflight(): { upstream: URL; dbUrl: string; secret: string } {
  const upstream = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3100");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("offline-audit: DATABASE_URL must be set and point at localhost; it writes sessions and files.");
  const parsed = new URL(dbUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.searchParams.has("host")) {
    throw new Error("offline-audit: DATABASE_URL must point at localhost and carry no host= parameter; it writes sessions and files.");
  }
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("offline-audit: set AUTH_SECRET to the same value `next start` runs with.");
  outDir = process.env.OFFLINE_AUDIT_OUT ?? `/tmp/offline-audit/${new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}`;
  assertOutsideRepo(outDir, process.cwd());
  return { upstream, dbUrl, secret };
}

async function main(): Promise<number> {
  const { upstream, dbUrl, secret } = preflight();
  const runId = randomBytes(3).toString("hex");
  const hold = { ms: 0, held: 0 };
  const tokens: string[] = [];
  const created: { id: string; key: string }[] = [];
  const restore: (() => Promise<void>)[] = [];
  let proxy: { origin: string; close: () => void } | undefined;
  let pool: Pool | undefined;
  let browser: Awaited<ReturnType<ReturnType<typeof resolvePlaywright>["chromium"]["launch"]>> | undefined;

  try {
    proxy = await startProxy(upstream, hold);
    const baseUrl = proxy.origin;
    pool = new Pool({ connectionString: dbUrl });
    const db = pool;
    browser = await resolvePlaywright().chromium.launch();
    const chrome = browser;

    const newContext = async (viewport: { width: number; height: number }, touch = false): Promise<BrowserContext> => {
      const user = await db.query<{ id: string }>('select id from "User" where email = $1', ["you@example.com"]);
      if (!user.rows[0]) throw new Error("offline-audit: you@example.com not found; run npm run db:seed:demo");
      const token = randomBytes(24).toString("base64url");
      tokens.push(token);
      await db.query(
        'insert into "AuthSession"(id, "expiresAt", token, "createdAt", "updatedAt", "userId") values ($1, $2, $3, now(), now(), $4)',
        [`audit${randomBytes(6).toString("hex")}`, new Date(Date.now() + 30 * DAY_MS), token, user.rows[0].id],
      );
      const signature = createHmac("sha256", secret).update(token).digest("base64");
      const c = await chrome.newContext({ viewport, hasTouch: touch, isMobile: touch });
      await c.addCookies([
        {
          name: SESSION_COOKIE,
          value: encodeURIComponent(`${token}.${signature}`),
          domain: new URL(baseUrl).hostname,
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
          expires: Math.floor((Date.now() + 30 * DAY_MS) / 1000),
        },
      ]);
      return c;
    };

    // ── Data: the Trip and two fresh Attachments to open offline ───────────
    const trip = await db.query<{ id: string; slug: string | null; owner: string; cover: string | null }>(
      'select t.id, t.slug, t."createdById" as owner, t."coverImageKey" as cover from "Trip" t where t.name = $1 order by t."createdAt" desc limit 1',
      [TRIP_NAME],
    );
    if (!trip.rows[0]) throw new Error(`offline-audit: no Trip named "${TRIP_NAME}"; run npm run db:seed:demo`);
    const { id: tripId, slug, owner, cover } = trip.rows[0];
    const home = `/trips/${slug ?? tripId}`;

    // Tonight's stay on the phone Home must show a whole confirmation number: give the seeded stay one if it has none, and put it back afterwards.
    const stayRow = await db.query<{ id: string; confirmation: string | null }>('select id, confirmation from "Accommodation" where "tripId" = $1 and name = $2 limit 1', [tripId, "Nelson Gateway Cabins"]);
    const stay = stayRow.rows[0];
    const stayConfirmation = stay?.confirmation ?? "AUDIT-NELSON-CONF-884217";
    if (stay && !stay.confirmation) {
      await db.query('update "Accommodation" set confirmation = $1 where id = $2', [stayConfirmation, stay.id]);
      restore.push(async () => void (await db.query('update "Accommodation" set confirmation = null where id = $1', [stay.id])));
    }

    const seeded: Record<"pdf" | "png", { id: string; filename: string }> = { pdf: { id: "", filename: "" }, png: { id: "", filename: "" } };
    for (const [kind, filename, mime, body] of [
      ["pdf", `audit-ticket-${runId}.pdf`, "application/pdf", PDF_BODY],
      ["png", `audit-photo-${runId}.png`, "image/png", PNG_BODY],
    ] as const) {
      const id = `audit${randomBytes(8).toString("hex")}`;
      const key = `trips/${tripId}/${id}-${filename}`;
      const dest = path.join(process.cwd(), ".uploads", key);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      created.push({ id, key });
      await db.query(
        'insert into "Attachment"(id, "tripId", "targetType", filename, mime, size, url, "storageKey", "uploadedById") values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, tripId, "TRIP", filename, mime, body.length, `/api/attachments/${id}`, key, owner],
      );
      seeded[kind] = { id, filename };
    }
    console.log(`trip: ${home}; run ${runId}; files: ${seeded.pdf.filename}, ${seeded.png.filename}\n`);

    // ── Setup (own browser profile, so its worker and caches are thrown away):
    // today's Day view, a Journal entry and a Checklist item to look at later.
    const journalText = `Audit entry ${runId}: the saved copy should show this.`;
    const setup = await newContext(DESKTOP);
    const sp = await setup.newPage();
    await sp.goto(`${baseUrl}${home}/day`, { waitUntil: "load" });
    await sp.waitForURL(/\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 15_000 }).catch(() => {});
    const today = /\/day\/(\d{4}-\d{2}-\d{2})/.exec(sp.url())?.[1];
    if (!today) throw new Error(`offline-audit: ${home}/day did not resolve to a dated Day view (${sp.url()})`);
    await sp.goto(`${baseUrl}${home}/journal`, { waitUntil: "load" });
    await sp.getByLabel("Journal entry").first().fill(journalText);
    await sp.getByRole("button", { name: "Save", exact: true }).first().click();
    await sp.getByRole("button", { name: "Save", exact: true }).first().waitFor({ state: "detached", timeout: 15_000 });
    await sp.reload({ waitUntil: "load" });
    const savedValue = await sp.getByLabel("Journal entry").first().inputValue();
    if (savedValue !== journalText) throw new Error(`offline-audit: the Journal entry did not save (found "${savedValue.slice(0, 40)}")`);
    await sp.goto(`${baseUrl}${home}/checklists`, { waitUntil: "load" });
    if ((await sp.getByText("Audit checklist item").count()) === 0) {
      await sp.getByPlaceholder("e.g. Book airport taxi").fill("Audit checklist item");
      await sp.getByRole("form", { name: "Add a pre-trip task" }).getByRole("button", { name: "Add item" }).click();
      await sp.getByText("Audit checklist item").first().waitFor({ timeout: 15_000 });
    }
    await setup.close();
    const dayPath = `${home}/day/${today}`;

    // ── Main context ───────────────────────────────────────────────────────
    const ctx = await newContext(DESKTOP);
    const keepalive: { status: number | null } = { status: null };
    ctx.on("response", (r) => {
      if (r.url().endsWith("/api/auth-keepalive") && r.request().method() === "POST") keepalive.status = r.status();
    });
    const offlinePage = async (): Promise<Page> => {
      const p = await ctx.newPage();
      watch(p);
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      return p;
    };

    try {
      phase = "online";
      await phaseRun("online checks 1, 11, 2", async () => {
        const page = await ctx.newPage();
        watch(page);
        await page.goto(`${baseUrl}${home}`, { waitUntil: "load" });

        // 1. The worker controls the page after the first load.
        const controlled = await poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), 20_000);
        record("1. Worker registered and controlling the page after first load", Boolean(controlled), controlled ? "navigator.serviceWorker.controller is set" : "no controller within 20s of the first load");
        if (!controlled) await shot(page, "1-no-controller");

        // 11. Sign-in keepalive and the 120-day cookie.
        const ka = await poll(async () => keepalive.status, 20_000);
        const cookie = async () => (await ctx.cookies()).find((c) => c.name.endsWith("session_token"));
        await poll(async () => {
          const c = await cookie();
          return c && (c.expires - Date.now() / 1000) / 86_400 > 100 ? c : null;
        }, 5_000);
        const c = await cookie();
        const days = c ? Math.round((c.expires - Date.now() / 1000) / 86_400) : null;
        record(
          "11. Sign-in keepalive returns 204 and the cookie slides to about 120 days",
          ka === 204 && days !== null && days >= 118 && days <= 121,
          `POST /api/auth-keepalive ${ka ?? "never sent"}; cookie ${c?.name ?? "missing"} expires in ${days ?? "?"} days (started at 30)`,
        );

        // 2. Saved for offline row: wait for it to settle, then judge.
        await page.goto(`${baseUrl}${home}/settings`, { waitUntil: "load" });
        let lastRow = "";
        const complete = await poll(async () => {
          const t = ((await page.locator('p[role="status"]').first().textContent()) ?? "").trim();
          lastRow = t;
          return /^Saved for offline · /.test(t) ? t : null;
        }, 180_000, 500);
        const expected = [home, `${home}/plan`, `${home}/summary`, `${home}/budget`, `${home}/calendar`, `${home}/checklists`, `${home}/files`, `${home}/journal`, dayPath, "/trips", `/api/attachments/${seeded.pdf.id}`, `/api/attachments/${seeded.png.id}`];
        const missing = await page.evaluate(async (paths) => {
          const out: string[] = [];
          for (const p of paths) if (!(await caches.match(p))) out.push(p);
          return out;
        }, expected);
        record(
          "2. Saved for offline row reports a complete save",
          complete !== null && missing.length === 0,
          `row settled at "${complete ?? (lastRow || "nothing")}"; expected paths missing from the cache: ${missing.length ? missing.join(", ") : "none"}`,
        );
        if (complete === null || missing.length) await shot(page, "2-saved-row");
      });

      // ── Offline ──────────────────────────────────────────────────────────
      phase = "offline";
      await ctx.setOffline(true);

      await phaseRun("check 0", async () => {
        const sentinel = await offlinePage();
        await sentinel.goto(`${baseUrl}${home}/activity`, { waitUntil: "load" }).catch(() => {});
        const info = await sentinel
          .evaluate(() => ({
            h1: document.querySelector("h1")?.textContent?.trim() ?? "",
            container: document.getElementById("saved-trips") !== null,
            controlled: navigator.serviceWorker?.controller != null,
            title: document.title,
          }))
          .catch(() => null);
        const ok = info !== null && /You.re offline/.test(info.h1) && info.container && info.controlled;
        record(
          "0. Offline emulation reaches the worker (an unsaved page gets the worker's offline.html)",
          ok,
          info ? `title "${info.title}", h1 "${info.h1}", saved-trips container ${info.container ? "present" : "ABSENT"}, worker controlling ${info.controlled}` : "no document (a browser error page, not the worker's answer)",
        );
        if (!ok) await shot(sentinel, "0-sentinel");
        await sentinel.close();
      });

      await phaseRun("checks 3, 6", async () => {
        const launch = await offlinePage();
        await launch.goto(`${baseUrl}/`, { waitUntil: "load" }).catch(() => {});
        await sleep(1500);
        const landed = await launch.evaluate(() => ({
          path: location.pathname,
          h1: document.querySelector("h1")?.textContent?.trim() ?? "",
          bars: Array.from(document.querySelectorAll('nav[aria-label="Trip sections"]')).filter((n) => (n as HTMLElement).checkVisibility()).length,
          text: document.body.innerText,
        }));
        record(
          '3. Offline "/" lands on the Trip Home from the saved copy, one tab bar',
          landed.path === home && landed.h1 === TRIP_NAME && landed.bars === 1,
          `ended on ${landed.path} (h1 "${landed.h1}", ${landed.bars} visible Trip sections bar(s))`,
        );
        if (landed.path !== home) await shot(launch, "3-cold-launch");
        record("6. A page served offline says it is a saved copy", SAVED_COPY.test(landed.text), SAVED_COPY.test(landed.text) ? `Home shows "Saved copy. Reload when you're back online"` : "the line is missing on the offline Home");
        if (!SAVED_COPY.test(landed.text)) await shot(launch, "6-saved-copy");
        await launch.close();
      });

      await phaseRun("checks 4", async () => {
        const files = await offlinePage();
        await files.goto(`${baseUrl}${home}/files`, { waitUntil: "load" }).catch(() => {});
        await sleep(1000);
        const filesText = await files.evaluate(() => document.body.innerText);
        const listed = filesText.includes(seeded.pdf.filename) && filesText.includes(seeded.png.filename);
        record("4a. Offline Files page lists the Attachments", listed, listed ? "both files are listed" : `page text lacks ${seeded.pdf.filename} or ${seeded.png.filename}`);
        if (!listed) await shot(files, "4a-files");
        for (const [label, file, type] of [["PDF", seeded.pdf, /pdf/], ["image", seeded.png, /png/]] as const) {
          const p = await offlinePage();
          const url = `${baseUrl}/api/attachments/${file.id}`;
          const resp = await p.goto(url, { waitUntil: "load" }).catch(() => null);
          let status = resp?.status() ?? 0;
          let length = resp ? (await resp.body().catch(() => Buffer.alloc(0))).length : 0;
          let mime = resp?.headers()["content-type"] ?? "";
          let via = "navigation";
          if (!resp) {
            await p.goto(`${baseUrl}${home}/files`, { waitUntil: "load" }).catch(() => {});
            const got = await p.evaluate(async (u) => {
              const r = await fetch(u);
              return { status: r.status, length: (await r.arrayBuffer()).byteLength, mime: r.headers.get("content-type") ?? "" };
            }, url).catch(() => ({ status: 0, length: 0, mime: "" }));
            ({ status, length, mime } = got);
            via = "fetch from a controlled page (the navigation itself was aborted by the browser)";
          }
          record(`4b. Offline ${label} Attachment opens from the worker`, status === 200 && length > 0 && type.test(mime), `GET ${new URL(url).pathname} via ${via}: ${status}, ${length} bytes, ${mime || "no content-type"}`);
          await p.close();
        }
        await files.close();
      });

      // 5. Each saved page renders, is interactive, and has every script/stylesheet cached.
      await phaseRun("check 5", async () => {
        type Probe = { name: string; kind: "page's own" | "shared header menu"; path: string; heading: RegExp; act: (p: Page) => Promise<boolean> };
        const header = async (p: Page): Promise<boolean> => {
          await p.getByRole("button", { name: "Notifications" }).first().click();
          return p.getByRole("menu").first().isVisible({ timeout: 3_000 }).catch(() => false);
        };
        const counter = async (p: Page): Promise<number | null> => {
          const m = /(\d+) \/ 500/.exec(await p.locator("body").innerText());
          return m ? Number(m[1]) : null;
        };
        const typeInJournal = async (p: Page): Promise<boolean> => {
          const box = p.getByLabel("Journal entry").first();
          const before = await counter(p);
          await box.click();
          await box.press("End");
          await box.pressSequentially(" +");
          const after = await counter(p);
          return before !== null && after !== null && after === before + 2;
        };
        const probes: Probe[] = [
          {
            name: "Home",
            kind: "page's own",
            path: home,
            heading: /Today/,
            act: async (p) => {
              await p.getByRole("button", { name: "Change cover photo" }).first().click();
              return p.getByRole("dialog").first().isVisible({ timeout: 3_000 }).catch(() => false);
            },
          },
          {
            name: "Day view",
            kind: "page's own",
            path: dayPath,
            heading: /Day plan/,
            act: async (p) => {
              await p.getByRole("button", { name: /Show day map/ }).first().click();
              await sleep(800);
              return (await p.getByRole("button", { name: /Hide day map/ }).count()) > 0;
            },
          },
          {
            name: "Money",
            kind: "page's own",
            path: `${home}/budget`,
            heading: /^Money$/,
            act: async (p) => {
              await p.getByRole("radio", { name: "Place" }).first().click();
              return (await p.getByRole("radio", { name: "Place" }).first().getAttribute("aria-checked")) === "true";
            },
          },
          {
            name: "Checklists",
            kind: "page's own",
            path: `${home}/checklists`,
            heading: /^Checklists$/,
            act: async (p) => {
              await p.getByRole("button", { name: "Apply Template" }).first().click();
              return p.getByText("Your templates").first().isVisible({ timeout: 3_000 }).catch(() => false);
            },
          },
          { name: "Files", kind: "shared header menu", path: `${home}/files`, heading: /^Files$/, act: header },
          {
            name: "Journal",
            kind: "page's own",
            path: `${home}/journal`,
            heading: /^Journal$/,
            act: typeInJournal,
          },
          { name: "Summary", kind: "shared header menu", path: `${home}/summary`, heading: /Trip summary/, act: header },
          {
            name: "Calendar",
            kind: "page's own",
            path: `${home}/calendar`,
            heading: /^Calendar$/,
            act: async (p) => {
              const agenda = p.getByRole("radio", { name: "Agenda" }).first();
              await agenda.click();
              return (await agenda.getAttribute("aria-checked")) === "true";
            },
          },
        ];
        for (const probe of probes) {
         try {
          const p = await offlinePage();
          await p.goto(`${baseUrl}${probe.path}`, { waitUntil: "load" }).catch(() => {});
          await sleep(1200);
          const state = await p.evaluate(
            async ({ heading }) => {
              const re = new RegExp(heading);
              const hs = Array.from(document.querySelectorAll("h1,h2")).map((h) => h.textContent?.trim() ?? "");
              const urls = Array.from(document.querySelectorAll("script[src], link[rel=stylesheet]"))
                .map((e) => (e as HTMLScriptElement).src || (e as HTMLLinkElement).href)
                .filter((u) => !new URL(u).pathname.startsWith("/_vercel/"));
              const uncached: string[] = [];
              for (const u of urls) if (!(await caches.match(u))) uncached.push(new URL(u).pathname);
              return { path: location.pathname, hasHeading: hs.some((h) => re.test(h)), assets: urls.length, uncached };
            },
            { heading: probe.heading.source },
          );
          let acted = false;
          let actError = "";
          try {
            acted = await probe.act(p);
          } catch (e) {
            actError = e instanceof Error ? e.message.split("\n")[0] : String(e);
          }
          await sleep(2_000);
          const after = await p
            .evaluate(
              ({ heading }) => ({
                path: location.pathname,
                url: location.pathname + location.search,
                hasHeading: Array.from(document.querySelectorAll("h1,h2")).some((h) => new RegExp(heading).test(h.textContent?.trim() ?? "")),
              }),
              { heading: probe.heading.source },
            )
            .catch(() => ({ path: "", url: "", hasHeading: false }));
          const ok = state.path === probe.path && state.hasHeading && acted && state.uncached.length === 0 && after.path === probe.path && after.hasHeading;
          record(
            `5. Offline ${probe.name} renders, is interactive, scripts and styles saved [probe: ${probe.kind}]`,
            ok,
            `path ${state.path}; heading ${state.hasHeading ? "found" : "MISSING"}; interaction ${acted ? "worked" : `FAILED${actError ? ` (${actError})` : ""}`}; two seconds later ${after.hasHeading && after.path === probe.path ? "still on the page" : `page is now ${after.url || "gone"} (heading ${after.hasHeading ? "found" : "MISSING"})`}; ${state.assets} scripts/styles, ${state.uncached.length} not in the cache${state.uncached.length ? `: ${state.uncached.slice(0, 4).join(", ")}` : ""}`,
          );
          if (!ok) await shot(p, `5-${probe.name}`);
          await p.close();
         } catch (e) {
          record(`5. Offline ${probe.name} renders, is interactive, scripts and styles saved [probe: ${probe.kind}]`, false, `probe threw: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
         }
        }
      });

      // 7. Offline writes keep what was typed.
      await phaseRun("check 7", async () => {
        const write = await offlinePage();
        await write.goto(`${baseUrl}${home}/journal`, { waitUntil: "load" }).catch(() => {});
        await sleep(1200);
        // A page opened while the emulation was already on still reads navigator.onLine === true; flip it so the page sees what a phone in airplane mode shows.
        await ctx.setOffline(false);
        await ctx.setOffline(true);
        await sleep(500);
        const typed = "Typed while offline.";
        const box = write.getByLabel("Journal entry").first();
        await box.fill(typed).catch(() => {});
        await write.getByRole("button", { name: "Save", exact: true }).first().click().catch(() => {});
        await sleep(1500);
        const journalState = await write.evaluate(() => ({ text: document.body.innerText, crashed: /Application error|Something went wrong/i.test(document.body.innerText) }));
        const journalKept = (await box.inputValue().catch(() => "")) === typed;
        const onLine = await write.evaluate(() => navigator.onLine);
        record(
          "7a. Offline Journal save shows the offline message and keeps the text",
          OFFLINE_MESSAGE.test(journalState.text) && journalKept && !journalState.crashed,
          `navigator.onLine ${onLine}; offline message ${OFFLINE_MESSAGE.test(journalState.text) ? "shown" : `MISSING (page says: ${/Couldn.t save[^\n]*/.exec(journalState.text)?.[0] ?? "nothing"})`}; typed text ${journalKept ? "kept" : "LOST"}; error screen ${journalState.crashed ? "YES" : "no"}`,
        );
        if (!(OFFLINE_MESSAGE.test(journalState.text) && journalKept)) await shot(write, "7a-journal");
        await write.goto(`${baseUrl}${home}/checklists`, { waitUntil: "load" }).catch(() => {});
        await sleep(1200);
        await ctx.setOffline(false);
        await ctx.setOffline(true);
        await sleep(500);
        const item = write.getByPlaceholder("e.g. Book airport taxi");
        await item.fill("Offline item").catch(() => {});
        await write.getByRole("form", { name: "Add a pre-trip task" }).getByRole("button", { name: "Add item" }).click().catch(() => {});
        await sleep(1500);
        const listState = await write.evaluate(() => ({ text: document.body.innerText, crashed: /Application error|Something went wrong/i.test(document.body.innerText), onLine: navigator.onLine }));
        const itemKept = (await item.inputValue().catch(() => "")) === "Offline item";
        record(
          "7b. Offline Checklist add shows the offline message and keeps the text",
          OFFLINE_MESSAGE.test(listState.text) && itemKept && !listState.crashed,
          `navigator.onLine ${listState.onLine}; offline message ${OFFLINE_MESSAGE.test(listState.text) ? "shown" : "MISSING"}; typed text ${itemKept ? "kept" : "LOST"}; error screen ${listState.crashed ? "YES" : "no"}`,
        );
        if (!(OFFLINE_MESSAGE.test(listState.text) && itemKept)) await shot(write, "7b-checklist");
        await write.close();
      });

      // 12. Query-string fallback: Place then Day on the saved Money page.
      await phaseRun("check 12", async () => {
        const p = await offlinePage();
        await p.goto(`${baseUrl}${home}/budget`, { waitUntil: "load" }).catch(() => {});
        await sleep(1500);
        const requested: string[] = [];
        p.on("request", (r) => {
          if (/[?&]by=/.test(r.url())) requested.push(r.url());
        });
        const tapped: string[] = [];
        let tapError = "";
        for (const grouping of ["Place", "Day"]) {
          const before = requested.length;
          try {
            await p.getByRole("radio", { name: grouping }).first().click({ timeout: 10_000 });
            await sleep(3_000);
            const key = `by=${grouping.toLowerCase()}`;
            tapped.push(`${grouping}: ${requested.slice(before).some((u) => u.includes(key)) ? "request seen" : "NO request seen"}`);
          } catch (e) {
            tapError = `${grouping} tap failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`;
            break;
          }
        }
        const acted = tapError === "" && tapped.length === 2 && tapped.every((t) => t.endsWith("request seen"));
        const end = await p.evaluate(() => ({
          path: location.pathname,
          url: location.pathname + location.search,
          money: Array.from(document.querySelectorAll("h1")).some((h) => h.textContent?.trim() === "Money"),
          offlinePage: document.getElementById("saved-trips") !== null,
          text: document.body.innerText,
        }));
        const line = SAVED_COPY.test(end.text);
        record(
          "12. Offline Money: tapping Place then Day keeps the saved Money page with the saved-copy line",
          acted && end.path === `${home}/budget` && end.money && !end.offlinePage && line,
          `taps ${tapError || tapped.join(", ")}; final URL ${end.url}; Money heading ${end.money ? "present" : "MISSING"}; offline.html ${end.offlinePage ? "SHOWN" : "not shown"}; saved-copy line ${line ? "shown" : "MISSING"}`,
        );
        if (!(acted && end.path === `${home}/budget` && end.money && !end.offlinePage && line)) await shot(p, "12-money-grouping");
        await p.close();
      });

      // 13. Offline Summary renders with a map fallback.
      let sumPage: Page | null = null;
      let failedChunk: string | null = null;
      await phaseRun("check 13", async () => {
        const p = await offlinePage();
        const chunkMessages: string[] = [];
        const uncaught: string[] = [];
        const failedChunks: string[] = [];
        p.on("console", (m) => {
          if (/chunk/i.test(m.text()) || /error boundary/i.test(m.text())) chunkMessages.push(m.text().slice(0, 160));
        });
        p.on("pageerror", (e) => {
          if (/ChunkLoadError/.test(e.message)) uncaught.push(e.message.slice(0, 160));
        });
        p.on("requestfailed", (r) => {
          if (/\/_next\/static\/chunks\/.*\.js/.test(r.url())) failedChunks.push(r.url());
        });
        await p.goto(`${baseUrl}${home}/summary`, { waitUntil: "load" }).catch(() => {});
        await sleep(2_500);
        const s = await p.evaluate(() => ({
          heading: Array.from(document.querySelectorAll("h2")).some((h) => /Trip summary/.test(h.textContent ?? "")),
          content: /Itinerary at a glance/.test(document.body.innerText),
          boundary: /That didn.t load/.test(document.body.innerText),
          fallback: document.querySelectorAll("[data-map-fallback]").length,
        }));
        const boundaryLogged = chunkMessages.some((m) => /error boundary/i.test(m));
        const ok = s.heading && s.content && !s.boundary && s.fallback > 0 && uncaught.length === 0 && !boundaryLogged;
        failedChunk = (failedChunks[0] ?? /\/_next\/static\/chunks\/[^\s"']+\.js/.exec(chunkMessages.join(" "))?.[0] ?? null);
        if (failedChunk && !failedChunk.startsWith("http")) failedChunk = `${baseUrl}${failedChunk}`;
        record(
          "13. Offline Summary renders its content with a map fallback and no error boundary",
          ok,
          `heading ${s.heading ? "present" : "MISSING"}; content ${s.content ? "present" : "MISSING"}; "That didn't load" ${s.boundary ? "SHOWN" : "absent"}; map fallbacks ${s.fallback}; uncaught ChunkLoadError ${uncaught.length}; boundary logged ${boundaryLogged}; chunk console messages: ${chunkMessages.length ? chunkMessages.join(" | ") : "none"}; failed chunk requests: ${failedChunks.length ? failedChunks.map((u) => new URL(u).pathname).join(", ") : "none"}`,
        );
        if (!ok) await shot(p, "13-summary");
        sumPage = p;
      });

      // ── Back online ──────────────────────────────────────────────────────
      phase = "slow";
      await ctx.setOffline(false);

      // 14. The failed map chunk is asked for again once the connection is back.
      await phaseRun("check 14", async () => {
        const chunk = failedChunk;
        const watchChunk = (p: Page, seen: { url: string; status: number }[]) =>
          p.on("response", (r) => {
            if (chunk && r.url() === chunk) seen.push({ url: r.url(), status: r.status() });
          });
        // Same document: the page of check 13 is still open and now online.
        const sameDoc: { url: string; status: number }[] = [];
        let sameDocNote = "FAILED: the failed chunk was not identified in check 13, nothing to watch";
        if (sumPage && chunk) {
          const sp2: Page = sumPage;
          watchChunk(sp2, sameDoc);
          const moved = await sp2
            .evaluate(
              async ({ a, b }) => {
                const router = (window as unknown as { next?: { router?: { push: (u: string) => void } } }).next?.router;
                if (!router) return false;
                router.push(a);
                await new Promise((r) => setTimeout(r, 2_000));
                router.push(b);
                await new Promise((r) => setTimeout(r, 3_000));
                return true;
              },
              { a: home, b: `${home}/summary` },
            )
            .catch(() => false);
          const fb = await sp2.evaluate(() => document.querySelectorAll("[data-map-fallback]").length).catch(() => -1);
          sameDocNote = moved ? `same document, client navigation Home then Summary: chunk requested ${sameDoc.length}x (${sameDoc.map((s) => s.status).join(",") || "never"}), map fallbacks afterwards ${fb}` : "FAILED: window.next.router is not available, the same-document navigation could not be made";
          await sp2.close();
        }
        // Fresh document, online.
        const fresh = await ctx.newPage();
        watch(fresh);
        const seen: { url: string; status: number }[] = [];
        watchChunk(fresh, seen);
        await fresh.goto(`${baseUrl}${home}/summary`, { waitUntil: "load" });
        await sleep(4_000);
        const dom = await fresh.evaluate(() => ({ fallbacks: document.querySelectorAll("[data-map-fallback]").length, map: document.querySelectorAll(".gm-style, gmp-map, [data-map-ready]").length, boundary: /That didn.t load/.test(document.body.innerText) }));
        const detail = `failed chunk watched: ${chunk ? new URL(chunk).pathname : "none identified in 13"}; ${sameDocNote}; extra, fresh online document: chunk requested ${seen.length}x (${seen.map((s) => s.status).join(",") || "never"}), real map nodes ${dom.map} (the local Maps key shows its key fallback instead), map fallbacks ${dom.fallbacks}, error boundary ${dom.boundary ? "SHOWN" : "absent"}`;
        const retried = sameDoc.some((s) => s.status === 200);
        record("14. Online again, the same document re-requests the failed map chunk and gets 200", retried, detail);
        await fresh.close();
      });

      // 8. Slow network.
      await phaseRun("checks 8", async () => {
        const slowTarget = `${baseUrl}${home}/budget`;
        const slow = await ctx.newPage();
        watch(slow);
        hold.ms = 6_000;
        hold.held = 0;
        const t0 = Date.now();
        await slow.goto(slowTarget, { waitUntil: "commit", timeout: 20_000 }).catch(() => {});
        const rendered = await slow.getByRole("heading", { name: "Money", exact: true }).first().waitFor({ timeout: 8_000 }).then(() => Date.now() - t0, () => null);
        const slowLine = await poll(async () => SAVED_COPY.test(await slow.evaluate(() => document.body.innerText)), 4_000);
        const ok = hold.held > 0 && rendered !== null && rendered < SLOW_BOUND_MS && Boolean(slowLine);
        record(
          "8a. Slow network (documents held 6s): saved page renders within 5s with the saved-copy line",
          ok,
          `took ${rendered ?? "never"}ms (bound ${SLOW_BOUND_MS}ms); ${hold.held} document request(s) held by the proxy; saved-copy line ${slowLine ? "shown" : "MISSING"}${hold.held === 0 ? " (the delay never applied, so this proves nothing)" : ""}`,
        );
        if (!ok) await shot(slow, "8a-slow");
        await slow.close();
        hold.ms = 0;
        await sleep(7_000);
        const fast = await ctx.newPage();
        watch(fast);
        await fast.goto(slowTarget, { waitUntil: "load" });
        await sleep(2_500);
        const fastText = await fast.evaluate(() => document.body.innerText);
        record("8b. Same navigation with no delay shows no saved-copy line", !SAVED_COPY.test(fastText) && /Money/.test(fastText), SAVED_COPY.test(fastText) ? "the line shows although the network answered at once" : "no line");
        await fast.close();
      });
    } finally {
      hold.ms = 0;
      await ctx.close().catch(() => {});
    }

    // ── Phone ──────────────────────────────────────────────────────────────
    phase = "phone";
    await phaseRun("phone checks 9 and 10", async () => {
      const pctx = await newContext(PHONE, true);
      try {
        const phone = await pctx.newPage();
        watch(phone);
        // Positive control: the Trips list shows this Trip's cover photo on a phone, so "no cover on Home" cannot pass for lack of one.
        await phone.goto(`${baseUrl}/trips`, { waitUntil: "load" });
        await sleep(2_000);
        const listCovers = await phone.evaluate(() => Array.from(document.querySelectorAll("img")).filter((i) => (i as HTMLElement).checkVisibility() && /\/cover/.test(i.getAttribute("src") ?? "")).length);
        await phone.goto(`${baseUrl}${home}`, { waitUntil: "load" });
        await sleep(2_000);
        const order = await phone.evaluate(() => {
          const tops = [/day \d+ of \d+/i, /^(now|next)$/i, /^today.s plan$/i, /^tonight.s stay$/i, /^add a cost$/i].map((re) => {
            const el = Array.from(document.querySelectorAll("main *, [data-testid='app-main'] *")).find((e) => (e as HTMLElement).checkVisibility() && re.test(e.textContent ?? "") && !Array.from(e.children).some((c) => re.test(c.textContent ?? "")));
            return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;
          });
          const visibleImgs = Array.from(document.querySelectorAll("img")).filter((i) => (i as HTMLElement).checkVisibility() && /\/cover/.test(i.getAttribute("src") ?? "")).length;
          const appMain = document.querySelector("[data-testid='app-main']") as HTMLElement | null;
          return {
            day: tops[0],
            next: tops[1],
            plan: tops[2],
            stay: tops[3],
            actions: tops[4],
            cover: visibleImgs,
            hasMain: appMain !== null,
            whatsNew: /what.s new/i.test(appMain?.innerText ?? ""),
            docW: document.documentElement.scrollWidth,
            vw: window.innerWidth,
          };
        });
        const stayInfo = await phone.evaluate(
          ({ conf }) => {
            const el = Array.from(document.querySelectorAll("main *, [data-testid='app-main'] *")).find((e) => (e as HTMLElement).checkVisibility() && (e.textContent ?? "").includes(conf) && !Array.from(e.children).some((c) => (c.textContent ?? "").includes(conf))) as HTMLElement | undefined;
            const addr = Array.from(document.querySelectorAll("a")).find((a) => /Kellett St/.test(a.textContent ?? "") && (a as HTMLElement).checkVisibility());
            return { found: el !== undefined, truncated: el ? el.scrollWidth > el.clientWidth + 1 || /\btruncate\b/.test(el.className) : false, address: addr ? addr.getAttribute("href") ?? "" : null };
          },
          { conf: stayConfirmation },
        );
        const stayOk = stayInfo.found && !stayInfo.truncated && Boolean(stayInfo.address);
        const ys = [order.day, order.next, order.plan, order.stay, order.actions];
        const inOrder = ys.every((y, i) => y >= 0 && (i === 0 || y > ys[i - 1]));
        const hasCover = cover !== null && listCovers > 0;
        await shot(phone, "9-phone-home");
        record(
          "9a. Phone Travelling Home: day line, Now/next, Today's plan, Tonight's stay, quick actions in order; no cover or What's new",
          order.hasMain && hasCover && inOrder && order.cover === 0 && !order.whatsNew && stayOk,
          `app-main ${order.hasMain ? "present" : "MISSING"}; Trip has a cover (coverImageKey ${cover ? "set" : "NULL"}, ${listCovers} cover image(s) on the phone Trips list as a positive control); y positions day ${order.day}, now/next ${order.next}, plan ${order.plan}, stay ${order.stay}, actions ${order.actions}${inOrder ? "" : " (NOT in order or missing)"}; cover images visible on Home ${order.cover}; What's new card ${order.whatsNew ? "SHOWN" : "absent"}; Tonight's stay confirmation \"${stayConfirmation}\" ${stay?.confirmation ? "(seeded)" : "(set by the audit, restored afterwards)"} ${stayInfo.found ? "present" : "MISSING"}, ${stayInfo.truncated ? "TRUNCATED" : "not truncated"}; address link ${stayInfo.address ? `to ${stayInfo.address.slice(0, 60)}` : "MISSING"}`,
        );
        record("9b. Phone Home is not wider than the viewport", order.docW === order.vw, `document width ${order.docW}, viewport ${order.vw}`);
        await phone.goto(`${baseUrl}${dayPath}`, { waitUntil: "load" });
        await sleep(2_000);
        const dayWidth = await phone.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: window.innerWidth, journal: Array.from(document.querySelectorAll("textarea")).some((t) => t.value.includes("Audit entry")) }));
        record("9c. Phone Day view with a Journal entry is not wider than the viewport", dayWidth.docW === dayWidth.vw && dayWidth.journal, `document width ${dayWidth.docW}, viewport ${dayWidth.vw}; Journal entry on the page: ${dayWidth.journal}`);
        if (dayWidth.docW !== dayWidth.vw) await shot(phone, "9c-day-width");

        // 10. Read-only details sheet, then Edit opens the form.
        for (const [label, target, row] of [["Home", home, /Check-in: Nelson Gateway Cabins/], ["Day view", dayPath, /Check-in: Nelson Gateway Cabins/]] as const) {
          await phone.goto(`${baseUrl}${target}`, { waitUntil: "load" });
          await sleep(2_000);
          await phone.getByRole("button", { name: row }).first().tap();
          const sheet = phone.getByRole("dialog").first();
          const hasSheet = await sheet.isVisible({ timeout: 4_000 }).catch(() => false);
          const edit = sheet.getByRole("button", { name: "Edit", exact: true });
          const readOnly = hasSheet && (await edit.count()) > 0 && (await sheet.locator("input, textarea").count()) === 0;
          let formOpened = false;
          if (readOnly) {
            await edit.first().tap();
            await sleep(1_000);
            formOpened = (await phone.getByRole("dialog").locator("input, textarea").count()) > 0;
          }
          record(`10. Phone ${label}: tapping a booking row opens the read-only sheet, Edit opens the form`, readOnly && formOpened, `sheet ${hasSheet ? "opened" : "did NOT open"}; read-only with Edit ${readOnly ? "yes" : "NO"}; Edit opened a form ${formOpened ? "yes" : "NO"}`);
          if (!(readOnly && formOpened)) await shot(phone, `10-${label}`);
        }
      } finally {
        await pctx.close().catch(() => {});
      }
    });

    // ── Plan dialogs and sign-out (each in its own browser profile) ────────
    phase = "plan";
    const planPath = `${home}/plan`;
    const waitSaved = async (p: Page): Promise<string> => {
      await p.goto(`${baseUrl}${home}/settings`, { waitUntil: "load" });
      let last = "";
      const done = await poll(async () => {
        last = ((await p.locator('p[role="status"]').first().textContent()) ?? "").trim();
        return /^Saved for offline · /.test(last) ? last : null;
      }, 180_000, 500);
      return done ?? `not settled: "${last}"`;
    };
    const boundaryText = /That didn.t load|Application error/;
    const tapStop = async (c: BrowserContext) => {
      const off = await c.newPage();
      watch(off);
      const cdp = await c.newCDPSession(off);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await off.goto(`${baseUrl}${planPath}`, { waitUntil: "load" }).catch(() => {});
      await sleep(2_000);
      const rendered = await off.getByRole("button", { name: "Open Torquay" }).count();
      // A page opened while the emulation was already on reads navigator.onLine === true (see check 7); flip it as a phone in airplane mode would show.
      await c.setOffline(false);
      await c.setOffline(true);
      await sleep(500);
      const served: string[] = [];
      const failed: string[] = [];
      off.on("response", (r) => {
        if (/\/_next\/static\/chunks\//.test(r.url())) served.push(`${r.status()} ${new URL(r.url()).pathname.split("/").pop()}`);
      });
      off.on("requestfailed", (r) => {
        if (/\/_next\/static\/chunks\//.test(r.url())) failed.push(new URL(r.url()).pathname.split("/").pop() ?? "");
      });
      let tapError = "";
      await off.getByRole("button", { name: "Open Torquay" }).first().tap({ timeout: 10_000 }).catch((e) => {
        tapError = e instanceof Error ? e.message.split("\n")[0] : String(e);
      });
      await sleep(3_000);
      const after = await off.evaluate(() => ({
        dialog: Array.from(document.querySelectorAll("[role=dialog]")).filter((d) => (d as HTMLElement).checkVisibility()).map((d) => (d.textContent ?? "").replace(/\s+/g, " ").slice(0, 120)),
        text: document.body.innerText,
        usable: Array.from(document.querySelectorAll("button")).some((b) => /Open Nelson/.test(b.getAttribute("aria-label") ?? b.textContent ?? "")),
      }));
      return { off, rendered, tapError, served, failed, after };
    };

    // 15. Saved case: Plan opened online long enough for the idle preloads, then offline.
    await phaseRun("check 15", async () => {
      const c = await newContext(PHONE, true);
      try {
        phase = "plan";
        const p = await c.newPage();
        watch(p);
        await p.goto(`${baseUrl}${planPath}`, { waitUntil: "load" });
        await sleep(6_000);
        const row = await waitSaved(p);
        await p.goto(`${baseUrl}${planPath}`, { waitUntil: "load" });
        await sleep(5_000);
        phase = "offline";
        await c.setOffline(true);
        const r = await tapStop(c);
        const opened = r.after.dialog.some((d) => /Torquay/.test(d)) && !boundaryText.test(r.after.text);
        record(
          "15. Offline Plan (Plan opened online first): tapping a Stop opens its sheet with its content, no error boundary",
          r.rendered > 0 && r.tapError === "" && opened,
          `save row "${row}"; Plan rendered offline ${r.rendered > 0 ? "yes" : "NO"}; tap ${r.tapError || "ok"}; dialog ${r.after.dialog.length ? `"${r.after.dialog[0]}"` : "NOT opened"}; error boundary ${boundaryText.test(r.after.text) ? "SHOWN" : "absent"}; offline message ${OFFLINE_MESSAGE.test(r.after.text) ? "shown" : "not shown"}; chunk requests after the tap served ${r.served.length ? r.served.join(", ") : "none"}, failed ${r.failed.length ? r.failed.join(", ") : "none"}`,
        );
        if (!(r.rendered > 0 && r.tapError === "" && opened)) await shot(r.off, "15-plan-stop");
      } finally {
        await c.close().catch(() => {});
      }
    });

    // 16. Unsaved case: the Trip is warmed from Home, Plan never opened online.
    await phaseRun("check 16", async () => {
      const c = await newContext(PHONE, true);
      try {
        phase = "plan";
        const p = await c.newPage();
        watch(p);
        await p.goto(`${baseUrl}${home}`, { waitUntil: "load" });
        await poll(() => p.evaluate(() => navigator.serviceWorker.controller !== null), 20_000);
        const row = await waitSaved(p);
        phase = "offline";
        await c.setOffline(true);
        const r = await tapStop(c);
        const boundary = boundaryText.test(r.after.text);
        const dialogOpened = r.after.dialog.some((d) => /Torquay/.test(d));
        const message = OFFLINE_MESSAGE.test(r.after.text);
        const ok = r.rendered > 0 && r.tapError === "" && !boundary && (dialogOpened || message) && r.after.usable;
        record(
          "16. Offline Plan (Plan never opened online): tapping a Stop does not hit the error boundary, shows the dialog or the offline message, Plan stays usable",
          ok,
          `save row "${row}"; Plan rendered offline ${r.rendered > 0 ? "yes" : "NO"}; tap ${r.tapError || "ok"}; dialog ${dialogOpened ? "opened (its chunk was saved anyway)" : "not opened"}; offline message ${message ? "shown" : "NOT shown"}; error boundary ${boundary ? "SHOWN" : "absent"}; Plan still usable ${r.after.usable}; chunk requests after the tap served ${r.served.length ? r.served.join(", ") : "none"}, failed ${r.failed.length ? r.failed.join(", ") : "none"}`,
        );
        if (!ok) await shot(r.off, "16-plan-stop-unsaved");
      } finally {
        await c.close().catch(() => {});
      }
    });

    // 17. Sign-out keeps the offline page and clears the private copy. Last: it clears the saved copy.
    // Better Auth refuses a sign-out whose Origin is the proxy's random port (only APP_URL is trusted), so this check talks to the server directly.
    const site = upstream.origin;
    await phaseRun("check 17", async () => {
      const c = await newContext(DESKTOP);
      try {
        phase = "online";
        const p = await c.newPage();
        watch(p);
        await p.goto(`${site}${home}`, { waitUntil: "load" });
        await poll(() => p.evaluate(() => navigator.serviceWorker.controller !== null), 20_000);
        const row = await waitSaved(p);
        await p.goto(`${site}/account`, { waitUntil: "load" });
        await sleep(1_500);
        const direct = p.getByRole("button", { name: "Sign out", exact: true }).filter({ visible: true });
        if ((await direct.count()) > 0) await direct.first().click({ timeout: 10_000 });
        else {
          await p.getByRole("button", { name: "Open traveller menu" }).filter({ visible: true }).first().click({ timeout: 10_000 });
          await p.getByRole("menuitem", { name: "Sign out" }).first().click({ timeout: 10_000 });
        }
        await p.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
        await sleep(3_000);
        const left = await p.evaluate(async () => {
          const trips: string[] = [];
          let offlinePage = false;
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            for (const req of await cache.keys()) {
              const pathname = new URL(req.url).pathname;
              if (pathname.startsWith("/trips")) trips.push(pathname);
              if (pathname === "/offline.html") offlinePage = true;
            }
          }
          const keys = Object.keys(localStorage).filter((k) => k.startsWith("teepee.offline."));
          return { trips, offlinePage, keys };
        });
        phase = "offline";
        await c.setOffline(true);
        const off = await c.newPage();
        watch(off);
        const cdp = await c.newCDPSession(off);
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await off.goto(`${site}${home}`, { waitUntil: "load" }).catch(() => {});
        await sleep(1_500);
        const o = await off.evaluate(() => ({
          title: document.title,
          h1: document.querySelector("h1")?.textContent?.trim() ?? "",
          container: document.getElementById("saved-trips") !== null,
          links: document.querySelectorAll("#saved-trips a").length,
          visibleLinks: Array.from(document.querySelectorAll("#saved-trips a")).filter((a) => (a as HTMLElement).checkVisibility()).length,
          text: document.body.innerText.replace(/\s+/g, " ").slice(0, 80),
        }));
        const ok = /You.re offline/.test(o.h1) && o.container && o.links === 0 && left.trips.length === 0 && left.keys.length === 0 && left.offlinePage;
        record(
          "17. Sign out clears the saved copy but keeps offline.html: a Trip URL offline gets the worker's offline page",
          ok,
          `save row before "${row}"; after sign-out: /trips entries left in caches ${left.trips.length ? left.trips.slice(0, 4).join(", ") : "none"}, teepee.offline.* keys ${left.keys.length ? left.keys.join(", ") : "none"}, offline.html still cached ${left.offlinePage}; offline Trip URL answered title "${o.title}", h1 "${o.h1}", saved-trips container ${o.container ? "present" : "ABSENT"} with ${o.links} link(s) (${o.visibleLinks} visible), text "${o.text}"`,
        );
        if (!ok) await shot(off, "17-signout");
      } finally {
        await c.close().catch(() => {});
      }
    });
  } finally {
    const warn = (what: string, e: unknown) => console.warn(`offline-audit: WARNING could not ${what}: ${e instanceof Error ? e.message : String(e)}`);
    if (pool) {
      for (const undo of restore) await undo().catch((e) => warn("restore the stay's confirmation number", e));
      if (tokens.length) await pool.query('delete from "AuthSession" where token = any($1)', [tokens]).catch((e) => warn(`delete ${tokens.length} AuthSession row(s)`, e));
      if (created.length) await pool.query('delete from "Attachment" where id = any($1)', [created.map((c) => c.id)]).catch((e) => warn(`delete ${created.length} Attachment row(s) ${created.map((c) => c.id).join(", ")}`, e));
      await pool.end().catch((e) => warn("close the database pool", e));
    }
    for (const c of created) {
      try {
        rmSync(path.join(process.cwd(), ".uploads", c.key), { force: true });
      } catch (e) {
        warn(`remove .uploads/${c.key}`, e);
      }
    }
    await browser?.close().catch((e) => warn("close the browser", e));
    proxy?.close();
  }

  const grouped = (rows: { phase: Phase; text: string }[]): string[] => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(`[${r.phase}] ${r.text}`, (seen.get(`[${r.phase}] ${r.text}`) ?? 0) + 1);
    return Array.from(seen, ([k, n]) => `  ${n}x ${k}`);
  };
  console.log("\nBrowser console errors:");
  console.log(consoleErrors.length ? grouped(consoleErrors).join("\n") : "  none");
  console.log("\nFailed requests (offline ones are expected):");
  const aborted = failedRequests.filter((r) => r.failure === "net::ERR_ABORTED").length;
  const failedGrouped = grouped(failedRequests.filter((r) => r.failure !== "net::ERR_ABORTED").map((r) => ({ phase: r.phase, text: `${r.failure} ${new URL(r.url).pathname}` })));
  console.log(failedGrouped.length ? failedGrouped.join("\n") : "  none");
  console.log(`  (${aborted} net::ERR_ABORTED prefetches and navigations superseded mid-flight, not listed)`);

  const failed = results.filter((r) => r.status === "FAIL");
  const na = results.filter((r) => r.status === "N/A").length;
  console.log(`\noffline-audit: ${results.filter((r) => r.status === "PASS").length}/${results.length} passed${na ? `, ${na} not observable` : ""}${failed.length ? ` — ${failed.length} FAILED` : ""}`);
  return failed.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
