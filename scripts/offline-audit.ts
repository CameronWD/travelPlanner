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
 * cookie is renewed out to 120. The rows are deleted at the end.
 *
 * WHY IT RUNS THROUGH A PROXY: page.route()/context.route() never see the
 * fetches a service worker makes, so they cannot delay the worker's own
 * network request (which is what the 4-second timeout in public/sw.js races).
 * The audit therefore starts a tiny pass-through proxy in front of
 * `next start` and drives the browser through it; the proxy can hold document
 * requests for 6 seconds on demand. It forwards the Host header untouched.
 *
 * Output: PASS/FAIL per check, console errors and failed requests at the end.
 * Screenshots go to OFFLINE_AUDIT_OUT (default /tmp/offline-audit/<timestamp>;
 * never inside the repo). Exit code 0 only when every check passed.
 */

import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
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

const PDF_BODY = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const PNG_BODY = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Result = { name: string; ok: boolean; detail: string };
type Phase = "online" | "offline" | "slow" | "phone";

const results: Result[] = [];
const consoleErrors: { phase: Phase; url: string; text: string }[] = [];
const failedRequests: { phase: Phase; url: string; failure: string }[] = [];
let phase: Phase = "online";
let outDir = "";

function record(name: string, ok: boolean, detail: string): boolean {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
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

async function shot(page: Page, label: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${label.replace(/[^a-z0-9]+/gi, "-")}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  return file;
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
      resolve({ origin: `http://localhost:${port}`, close: () => server.close() });
    });
  });
}

async function main(): Promise<void> {
  const upstream = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3100");
  const hold = { ms: 0, held: 0 };
  const proxy = await startProxy(upstream, hold);
  const baseUrl = proxy.origin;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname)) {
    throw new Error("offline-audit: DATABASE_URL must be set and point at localhost; it writes sessions and files.");
  }
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("offline-audit: set AUTH_SECRET to the same value `next start` runs with.");
  outDir = process.env.OFFLINE_AUDIT_OUT ?? `/tmp/offline-audit/${new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}`;
  assertOutsideRepo(outDir, process.cwd());

  const pool = new Pool({ connectionString: dbUrl });
  const tokens: string[] = [];
  const browserTypes = resolvePlaywright();
  const browser = await browserTypes.chromium.launch();

  const newContext = async (viewport: { width: number; height: number }, touch = false): Promise<BrowserContext> => {
    const user = await pool.query<{ id: string }>('select id from "User" where email = $1', ["you@example.com"]);
    if (!user.rows[0]) throw new Error("offline-audit: you@example.com not found; run npm run db:seed:demo");
    const token = randomBytes(24).toString("base64url");
    tokens.push(token);
    await pool.query(
      'insert into "AuthSession"(id, "expiresAt", token, "createdAt", "updatedAt", "userId") values ($1, $2, $3, now(), now(), $4)',
      [`audit${randomBytes(6).toString("hex")}`, new Date(Date.now() + 30 * DAY_MS), token, user.rows[0].id],
    );
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.addCookies([
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
    return ctx;
  };

  try {
    // ── Data: the Trip and two Attachments to open offline ─────────────────
    const trip = await pool.query<{ id: string; slug: string | null; owner: string }>(
      'select t.id, t.slug, t."createdById" as owner from "Trip" t where t.name = $1 order by t."createdAt" desc limit 1',
      [TRIP_NAME],
    );
    if (!trip.rows[0]) throw new Error(`offline-audit: no Trip named "${TRIP_NAME}"; run npm run db:seed:demo`);
    const { id: tripId, slug, owner } = trip.rows[0];
    const ref = slug ?? tripId;
    const home = `/trips/${ref}`;

    const existing = await pool.query<{ id: string; filename: string; mime: string }>(
      'select id, filename, mime from "Attachment" where "tripId" = $1 order by "createdAt"',
      [tripId],
    );
    const seeded: Record<"pdf" | "png", { id: string; filename: string }> = { pdf: { id: "", filename: "" }, png: { id: "", filename: "" } };
    for (const [kind, filename, mime, body] of [
      ["pdf", "audit-ticket.pdf", "application/pdf", PDF_BODY],
      ["png", "audit-photo.png", "image/png", PNG_BODY],
    ] as const) {
      const have = existing.rows.find((r) => r.mime === mime);
      if (have) {
        seeded[kind] = have;
        continue;
      }
      const id = `audit${randomBytes(8).toString("hex")}`;
      const key = `trips/${tripId}/${id}-${filename}`;
      const dest = path.join(process.cwd(), ".uploads", key);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      await pool.query(
        'insert into "Attachment"(id, "tripId", "targetType", filename, mime, size, url, "storageKey", "uploadedById") values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, tripId, "TRIP", filename, mime, body.length, `/api/attachments/${id}`, key, owner],
      );
      seeded[kind] = { id, filename };
    }
    console.log(`trip: ${home}; files: ${seeded.pdf.filename}, ${seeded.png.filename}\n`);

    // ── Setup (own browser profile, so its worker and caches are thrown away):
    // today's Day view, a Journal entry and a Checklist item to look at later.
    const setup = await newContext(DESKTOP);
    const sp = await setup.newPage();
    await sp.goto(`${baseUrl}${home}/day`, { waitUntil: "load" });
    await sp.waitForURL(/\/day\/\d{4}-\d{2}-\d{2}/, { timeout: 15_000 }).catch(() => {});
    const today = /\/day\/(\d{4}-\d{2}-\d{2})/.exec(sp.url())?.[1];
    if (!today) throw new Error(`offline-audit: ${home}/day did not resolve to a dated Day view (${sp.url()})`);
    await sp.goto(`${baseUrl}${home}/journal`, { waitUntil: "load" });
    const entry = sp.getByLabel("Journal entry").first();
    if (!(await entry.inputValue().catch(() => ""))) {
      await entry.fill("Audit entry: the saved copy should show this.");
      await sp.getByRole("button", { name: "Save", exact: true }).first().click();
      await sp.getByRole("button", { name: "Remove entry" }).first().waitFor({ timeout: 15_000 });
    }
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
    const renewed = await poll(async () => {
      const c = await cookie();
      return c && (c.expires - Date.now() / 1000) / 86_400 > 100 ? c : null;
    }, 5_000);
    const c = await cookie();
    const days = c ? Math.round((c.expires - Date.now() / 1000) / 86_400) : null;
    record(
      "11. Sign-in keepalive returns 204 and the cookie slides to about 120 days",
      ka === 204 && renewed !== null && days !== null && days >= 118 && days <= 121,
      `POST /api/auth-keepalive ${ka ?? "never sent"}; cookie ${c?.name ?? "missing"} expires in ${days ?? "?"} days (started at 30)`,
    );

    // 2. Saved for offline row.
    await page.goto(`${baseUrl}${home}/settings`, { waitUntil: "load" });
    const rowText = await poll(async () => {
      const t = (await page.locator('p[role="status"]').filter({ hasText: /^Saved/ }).first().textContent()) ?? "";
      return /^Saved/.test(t) ? t.trim() : null;
    }, 180_000, 500);
    const expected = [home, `${home}/plan`, `${home}/summary`, `${home}/budget`, `${home}/calendar`, `${home}/checklists`, `${home}/files`, `${home}/journal`, dayPath, "/trips", `/api/attachments/${seeded.pdf.id}`, `/api/attachments/${seeded.png.id}`];
    const missing = await page.evaluate(async (paths) => {
      const out: string[] = [];
      for (const p of paths) if (!(await caches.match(p))) out.push(p);
      return out;
    }, expected);
    record(
      "2. Saved for offline row reports a complete save",
      rowText !== null && /^Saved for offline · /.test(rowText),
      `row reads "${rowText ?? "no Saved row within 180s"}"; expected paths missing from the cache: ${missing.length ? missing.join(", ") : "none"}`,
    );
    if (rowText === null || !/^Saved for offline · /.test(rowText)) await shot(page, "2-saved-row");

    // ── Offline ────────────────────────────────────────────────────────────
    phase = "offline";
    await ctx.setOffline(true);
    const offlinePage = async (): Promise<Page> => {
      const p = await ctx.newPage();
      watch(p);
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      return p;
    };

    // Guard: a page that was never saved must NOT render, or setOffline is not reaching the worker.
    const sentinel = await offlinePage();
    await sentinel.goto(`${baseUrl}${home}/activity`, { waitUntil: "load" }).catch(() => {});
    const sentinelText = await sentinel.evaluate(() => `${document.title} | ${document.body?.innerText.slice(0, 120) ?? ""}`).catch(() => "no document");
    const realPage = await sentinel.getByRole("heading", { name: /Activity/ }).count().catch(() => 0);
    record(
      "0. Offline emulation reaches the worker (an unsaved page does not render)",
      realPage === 0,
      realPage === 0 ? `unsaved page answered with: ${sentinelText.replace(/\s+/g, " ").slice(0, 100)}` : "the unsaved Activity page rendered for real; offline checks below are invalid",
    );
    await sentinel.close();

    // 3. Cold launch at "/" offline.
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

    // 6. Saved-copy line, read on the Home just opened.
    record("6. A page served offline says it is a saved copy", SAVED_COPY.test(landed.text), SAVED_COPY.test(landed.text) ? `Home shows "Saved copy. Reload when you're back online"` : "the line is missing on the offline Home");
    if (!SAVED_COPY.test(landed.text)) await shot(launch, "6-saved-copy");
    await launch.close();

    // 4. Files page and Attachments.
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

    // 5. Each saved page renders, is interactive, and has every script/stylesheet cached.
    type Probe = { name: string; path: string; heading: RegExp; act: (p: Page) => Promise<boolean> };
    const header = async (p: Page): Promise<boolean> => {
      await p.getByRole("button", { name: "Notifications" }).first().click();
      return p.getByRole("menu").first().isVisible({ timeout: 3_000 }).catch(() => false);
    };
    const probes: Probe[] = [
      {
        name: "Home",
        path: home,
        heading: /Today/,
        act: header,
      },
      {
        name: "Day view",
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
        path: `${home}/budget`,
        heading: /^Money$/,
        act: async (p) => {
          await p.getByRole("radio", { name: "Place" }).first().click();
          return (await p.getByRole("radio", { name: "Place" }).first().getAttribute("aria-checked")) === "true";
        },
      },
      {
        name: "Checklists",
        path: `${home}/checklists`,
        heading: /^Checklists$/,
        act: async (p) => {
          await p.getByRole("button", { name: "Apply Template" }).first().click();
          return p.getByText("Your templates").first().isVisible({ timeout: 3_000 }).catch(() => false);
        },
      },
      { name: "Files", path: `${home}/files`, heading: /^Files$/, act: header },
      {
        name: "Journal",
        path: `${home}/journal`,
        heading: /^Journal$/,
        act: async (p) => {
          const box = p.getByLabel("Journal entry").first();
          await box.click();
          await box.press("End");
          await box.pressSequentially(" +");
          return /\/ 500/.test((await p.locator("body").innerText()).replace(/\s+/g, " ")) && (await box.inputValue()).endsWith(" +");
        },
      },
      { name: "Summary", path: `${home}/summary`, heading: /Trip summary/, act: header },
      {
        name: "Calendar",
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
      const after = await p.evaluate(
        ({ heading }) => ({
          path: location.pathname,
          url: location.pathname + location.search,
          hasHeading: Array.from(document.querySelectorAll("h1,h2")).some((h) => new RegExp(heading).test(h.textContent?.trim() ?? "")),
        }),
        { heading: probe.heading.source },
      ).catch(() => ({ path: "", url: "", hasHeading: false }));
      const ok = state.path === probe.path && state.hasHeading && acted && state.uncached.length === 0 && after.path === probe.path && after.hasHeading;
      record(
        `5. Offline ${probe.name} renders, is interactive, scripts and styles saved`,
        ok,
        `path ${state.path}; heading ${state.hasHeading ? "found" : "MISSING"}; interaction ${acted ? "worked" : `FAILED${actError ? ` (${actError})` : ""}`}; two seconds later ${after.hasHeading && after.path === probe.path ? "still on the page" : `page is now ${after.url || "gone"} (heading ${after.hasHeading ? "found" : "MISSING"})`}; ${state.assets} scripts/styles, ${state.uncached.length} not in the cache${state.uncached.length ? `: ${state.uncached.slice(0, 4).join(", ")}` : ""}`,
      );
      if (!ok) await shot(p, `5-${probe.name}`);
      await p.close();
    }

    // 7. Offline writes keep what was typed.
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
    const journalState = await write.evaluate(() => ({ text: document.body.innerText, crashed: /Application error|Something went wrong/i.test(document.body.innerText), path: location.pathname }));
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
    const listState = await write.evaluate(() => ({ text: document.body.innerText, crashed: /Application error|Something went wrong/i.test(document.body.innerText) }));
    const itemKept = (await item.inputValue().catch(() => "")) === "Offline item";
    record(
      "7b. Offline Checklist add shows the offline message and keeps the text",
      OFFLINE_MESSAGE.test(listState.text) && itemKept && !listState.crashed,
      `navigator.onLine ${await write.evaluate(() => navigator.onLine)}; offline message ${OFFLINE_MESSAGE.test(listState.text) ? "shown" : "MISSING"}; typed text ${itemKept ? "kept" : "LOST"}; error screen ${listState.crashed ? "YES" : "no"}`,
    );
    if (!(OFFLINE_MESSAGE.test(listState.text) && itemKept)) await shot(write, "7b-checklist");
    await write.close();

    // ── Online, slow network ───────────────────────────────────────────────
    phase = "slow";
    await ctx.setOffline(false);
    const slowTarget = `${baseUrl}${home}/budget`;
    const slow = await ctx.newPage();
    watch(slow);
    hold.ms = 6_000;
    hold.held = 0;
    const t0 = Date.now();
    await slow.goto(slowTarget, { waitUntil: "commit", timeout: 20_000 }).catch(() => {});
    const rendered = await slow.getByRole("heading", { name: "Money", exact: true }).first().waitFor({ timeout: 8_000 }).then(() => Date.now() - t0, () => null);
    const slowLine = await poll(async () => SAVED_COPY.test(await slow.evaluate(() => document.body.innerText)), 4_000);
    record(
      "8a. Slow network (documents held 6s): saved page renders within 5s with the saved-copy line",
      hold.held > 0 && rendered !== null && rendered < 5_000 && Boolean(slowLine),
      `${hold.held} document request(s) held by the proxy; heading after ${rendered ?? "never"}ms; saved-copy line ${slowLine ? "shown" : "MISSING"}${hold.held === 0 ? " (the delay never applied, so this proves nothing)" : ""}`,
    );
    if (!(hold.held > 0 && rendered !== null && rendered < 5_000 && slowLine)) await shot(slow, "8a-slow");
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
    await ctx.close();

    // ── Phone ──────────────────────────────────────────────────────────────
    phase = "phone";
    const pctx = await newContext(PHONE, true);
    const phone = await pctx.newPage();
    watch(phone);
    await phone.goto(`${baseUrl}${home}`, { waitUntil: "load" });
    await sleep(2_000);
    const order = await phone.evaluate(() => {
      const tops = [/day \d+ of \d+/i, /^(now|next)$/i, /^today.s plan$/i, /^tonight.s stay$/i, /^add a cost$/i].map((re) => {
        const el = Array.from(document.querySelectorAll("main *, [data-testid='app-main'] *")).find((e) => (e as HTMLElement).checkVisibility() && re.test(e.textContent ?? "") && !Array.from(e.children).some((c) => re.test(c.textContent ?? "")));
        return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;
      });
      const visibleImgs = Array.from(document.querySelectorAll("img")).filter((i) => (i as HTMLElement).checkVisibility() && /\/cover/.test(i.getAttribute("src") ?? "") ).length;
      const main = (document.querySelector("[data-testid='app-main']") as HTMLElement | null)?.innerText ?? "";
      return {
        day: tops[0],
        next: tops[1],
        plan: tops[2],
        stay: tops[3],
        actions: tops[4],
        cover: visibleImgs,
        whatsNew: /what.s new/i.test(main),
        docW: document.documentElement.scrollWidth,
        vw: window.innerWidth,
      };
    });
    const ys = [order.day, order.next, order.plan, order.stay, order.actions];
    const inOrder = ys.every((y, i) => y >= 0 && (i === 0 || y > ys[i - 1]));
    await shot(phone, "9-phone-home");
    record(
      "9a. Phone Travelling Home: day line, Now/next, Today's plan, Tonight's stay, quick actions in order; no cover or What's new",
      inOrder && order.cover === 0 && !order.whatsNew,
      `y positions day ${order.day}, now/next ${order.next}, plan ${order.plan}, stay ${order.stay}, actions ${order.actions}${inOrder ? "" : " (NOT in order or missing)"}; cover images visible ${order.cover}; What's new card ${order.whatsNew ? "SHOWN" : "absent"}`,
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
    await pctx.close();
  } finally {
    if (tokens.length) await pool.query('delete from "AuthSession" where token = any($1)', [tokens]).catch(() => {});
    await pool.end().catch(() => {});
    await browser.close().catch(() => {});
    proxy.close();
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

  const failed = results.filter((r) => !r.ok);
  console.log(`\noffline-audit: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} FAILED` : ""}`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
