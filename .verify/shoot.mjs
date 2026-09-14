/**
 * Visual verification screenshot script.
 * Run: node .verify/shoot.mjs
 * Requires: @playwright/test installed, Chromium downloaded.
 */
// Set LD_LIBRARY_PATH for manually extracted system libs (needed in sandbox env)
const EXTRA_LIBS = "/tmp/chromium-libs/usr/lib/aarch64-linux-gnu:/tmp/chromium-libs/lib/aarch64-linux-gnu";
if (!process.env.LD_LIBRARY_PATH || !process.env.LD_LIBRARY_PATH.includes("/tmp/chromium-libs")) {
  process.env.LD_LIBRARY_PATH = EXTRA_LIBS + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
}

import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = "http://localhost:3939";
const TRIP = "seed-trip-europe-2026";

/** Navigates and waits for network idle + a small buffer */
async function goto(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
}

/** Set theme via localStorage and reload */
async function setTheme(page, theme) {
  await page.evaluate((t) => {
    window.localStorage.setItem("trip-planner-theme", t);
  }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
}

async function screenshot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${name}`);
  return file;
}

async function main() {
  console.log("Launching Chromium (desktop 1280×900)…");
  const browser = await chromium.launch();

  // ─── Desktop context ───────────────────────────────────────────────────
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    // Opt out of prefers-color-scheme so we control theme explicitly
    colorScheme: "light",
  });
  const page = await ctx.newPage();

  // 1. Sign in via dev-login button for "You"
  console.log("\nSigning in as you@example.com…");
  await goto(page, `${BASE}/signin`);

  // Screenshot sign-in page BEFORE clicking (logged-out state)
  // (we'll do this later with a fresh context)

  // Click the dev sign-in button for "You"
  const devBtn = page.getByRole("button", { name: /Continue as You/i });
  await devBtn.waitFor({ timeout: 10000 });
  await devBtn.click();
  await page.waitForURL("**/trips", { timeout: 15000 });
  await page.waitForTimeout(800);
  console.log("  Signed in, landed on /trips");

  // ─── 01 trips light ────────────────────────────────────────────────────
  console.log("\nCapturing 01-trips-light…");
  await setTheme(page, "light");
  await goto(page, `${BASE}/trips`);
  await screenshot(page, "01-trips-light.png");

  // ─── 02 overview light + dark ──────────────────────────────────────────
  console.log("\nCapturing 02-overview-light…");
  await setTheme(page, "light");
  await goto(page, `${BASE}/trips/${TRIP}`);
  await screenshot(page, "02-overview-light.png");

  console.log("Capturing 02-overview-dark…");
  await setTheme(page, "dark");
  await goto(page, `${BASE}/trips/${TRIP}`);
  await screenshot(page, "02-overview-dark.png");

  // ─── 03 calendar light + dark ──────────────────────────────────────────
  console.log("\nCapturing 03-calendar-light…");
  await setTheme(page, "light");
  await goto(page, `${BASE}/trips/${TRIP}/calendar`);
  await screenshot(page, "03-calendar-light.png");

  console.log("Capturing 03-calendar-dark…");
  await setTheme(page, "dark");
  await goto(page, `${BASE}/trips/${TRIP}/calendar`);
  await screenshot(page, "03-calendar-dark.png");

  // ─── 04 day view (2026-07-02 has Tower of London + Dinner) ─────────────
  console.log("\nCapturing 04-day-light…");
  await setTheme(page, "light");
  await goto(page, `${BASE}/trips/${TRIP}/day/2026-07-02`);
  await screenshot(page, "04-day-light.png");

  // ─── 05 wishlist light ─────────────────────────────────────────────────
  console.log("\nCapturing 05-wishlist-light…");
  await setTheme(page, "light");
  await goto(page, `${BASE}/trips/${TRIP}/wishlist`);
  await screenshot(page, "05-wishlist-light.png");

  await ctx.close();

  // ─── 06 signin page (fresh logged-out context) ─────────────────────────
  console.log("\nCapturing 06-signin-light…");
  const signInCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
  });
  const signInPage = await signInCtx.newPage();
  await goto(signInPage, `${BASE}/signin`);
  await screenshot(signInPage, "06-signin-light.png");
  await signInCtx.close();

  // ─── Mobile sweep: 320px (iPhone SE floor) and 390px ────────────────────
  for (const [tag, viewport] of [
    ["m320", { width: 320, height: 568 }],
    ["m390", { width: 390, height: 844 }],
  ]) {
    console.log(`\nMobile sweep ${tag} (${viewport.width}×${viewport.height})…`);
    const mCtx = await browser.newContext({ viewport, colorScheme: "light" });
    const mPage = await mCtx.newPage();
    await goto(mPage, `${BASE}/signin`);
    await screenshot(mPage, `${tag}-signin.png`);
    const btn = mPage.getByRole("button", { name: /Continue as You/i });
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await mPage.waitForURL("**/trips", { timeout: 15000 });
    await mPage.waitForTimeout(600);
    await mPage.evaluate(() => {
      window.localStorage.setItem("trip-planner-theme", "light");
    });

    for (const [name, path] of [
      ["trips", `/trips`],
      ["home", `/trips/${TRIP}`],
      ["plan", `/trips/${TRIP}/plan`],
      ["calendar", `/trips/${TRIP}/calendar`],
      ["budget", `/trips/${TRIP}/budget`],
      ["wishlist", `/trips/${TRIP}/wishlist`],
      ["day", `/trips/${TRIP}/day/2026-07-02`],
    ]) {
      await goto(mPage, `${BASE}${path}`);
      await screenshot(mPage, `${tag}-${name}.png`);
    }

    // Form dialog: open an "add" affordance on the plan page and capture the
    // sheet with its (now sticky) footer and stacked field pairs.
    await goto(mPage, `${BASE}/trips/${TRIP}/plan`);
    const addBtn = mPage
      .getByRole("button", { name: /add stop|add a stop|add/i })
      .first();
    try {
      await addBtn.click({ timeout: 5000 });
      await mPage.waitForTimeout(600);
      await mPage.screenshot({
        path: path.join(OUT, `${tag}-dialog-add.png`),
        fullPage: false,
      });
      console.log(`  ✓ ${tag}-dialog-add.png`);
      await mPage.keyboard.press("Escape");
    } catch {
      console.log(`  (skipped ${tag}-dialog-add.png — no add button found)`);
    }

    // One dark-mode sanity shot per viewport.
    await setTheme(mPage, "dark");
    await goto(mPage, `${BASE}/trips/${TRIP}`);
    await screenshot(mPage, `${tag}-home-dark.png`);

    await mCtx.close();
  }

  await browser.close();

  console.log("\nAll screenshots captured in /work/.verify/");
}

main().catch((err) => {
  console.error("Screenshot script failed:", err);
  process.exit(1);
});
