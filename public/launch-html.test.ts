import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MARK_BODY_D, MARK_DOOR_D, MARK_POLES_D } from "../components/ui/logo";
import { WORDMARK_WORD_D, WORDMARK_DOT_D } from "../lib/wordmark";
import { FORCED_THEME, noFlashScript } from "../components/ui/theme-provider";
import { LAUNCH_TARGET, STARTUP_THEMES } from "../lib/startup-images";

const HTML = readFileSync(join(__dirname, "launch.html"), "utf8");
const GLOBALS = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

describe("public/launch.html", () => {
  it("hands over to the app with replace, and with a refresh when scripts are off", () => {
    expect(HTML).toContain(`location.replace('${LAUNCH_TARGET}');`);
    expect(HTML).toContain(`<noscript><meta http-equiv="refresh" content="0;url=${LAUNCH_TARGET}"></noscript>`);
  });

  it("makes no request of its own", () => {
    expect(HTML).not.toMatch(/https?:/);
    expect(HTML).not.toMatch(/\ssrc=/);
    expect(HTML).not.toMatch(/<link/);
    const hrefs = [...HTML.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([LAUNCH_TARGET]);
  });

  it("draws the mark and wordmark from the app's own path constants", () => {
    for (const d of [MARK_BODY_D, MARK_DOOR_D, MARK_POLES_D, WORDMARK_WORD_D, WORDMARK_DOT_D]) expect(HTML).toContain(`d="${d}"`);
  });

  it("carries the loading animation, and switches it off for reduced motion", () => {
    for (const line of GLOBALS.split("\n").filter((l) => l.startsWith("@keyframes tp-build-"))) expect(HTML).toContain(line.replace("var(--ease-pop)", "cubic-bezier(0.2, 0.8, 0.2, 1)"));
    expect(HTML).toContain("@media (prefers-reduced-motion: reduce)");
    expect(HTML).toContain(".tp-build-idle { animation: none; }");
  });

  it("follows the app's theme with the app's own no-flash script", () => {
    expect(HTML).toContain(`<script>${noFlashScript(FORCED_THEME)}</script>`);
    expect(HTML).toContain(`background:${STARTUP_THEMES.light.background}`);
    expect(HTML).toContain(`html.dark{background:${STARTUP_THEMES.dark.background}!important`);
  });

  it("is a status page that names itself, is not indexed and uses the app's viewport", () => {
    expect(HTML).toContain('role="status"');
    expect(HTML).toContain('<span class="sr-only">Loading</span>');
    expect(HTML).toContain("<title>Teepee</title>");
    expect(HTML).toContain('<html lang="en"');
    expect(HTML).toContain('<meta name="robots" content="noindex">');
    expect(HTML).toContain("viewport-fit=cover");
    expect(HTML).toContain('name="theme-color"');
  });

  it("offers a plain link only after ten seconds", () => {
    expect(HTML).toContain("Open Teepee");
    expect(HTML).toContain("},10000);");
  });
});
