import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { MoneyEntrance } from "./money-entrance";
import { MoneyCountUp } from "./money-count-up";

/**
 * CRITICAL fix (code review): the entrance decision used to be made during
 * render (a `useState` lazy initialiser reading sessionStorage directly),
 * which returns "pending" server-side but "play" on the very first *client*
 * render too — differing from the server-rendered markup and triggering a
 * React 19 "Hydration failed…" recoverable error, after which React
 * discards and re-renders the whole subtree client-only, re-running the
 * initialiser a second time — which now finds the sessionStorage key already
 * set and returns "static", so the count-up never actually plays on a real
 * page load. This test exercises the real SSR → hydrate path (not just a
 * plain client `render()`, which never surfaces this because it has no
 * server-rendered markup to mismatch against) and asserts hydration is
 * clean and the count-up then progresses.
 */
function App({ tripId }: { tripId: string }) {
  return (
    <MoneyEntrance tripId={tripId}>
      <MoneyCountUp minor={1482040} currency="AUD" tripId={tripId} />
    </MoneyEntrance>
  );
}

function whole(container: HTMLElement): string | null | undefined {
  return container.querySelector("[aria-hidden='true']")?.textContent;
}

describe("MoneyEntrance + MoneyCountUp: real SSR → hydrate (fresh session)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("hydrates with no recoverable error, then the total resets off its SSR value and counts up", async () => {
    const html = renderToString(<App tripId="hydrate-1" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // SSR renders "pending" → skip → the final value, no animation.
    expect(whole(container)).toBe("$14,820");

    const onRecoverableError = (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error));
    };

    await act(async () => {
      hydrateRoot(container, <App tripId="hydrate-1" />, { onRecoverableError });
      // Let the post-commit microtask-deferred bits (money-entrance's
      // useSyncExternalStore correction, use-tween's restart-from-`from`)
      // settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    // The fix: entrance resolves to "play" after hydration and use-tween
    // restarts the total from 0 rather than leaving it parked at the
    // SSR-rendered final value (which would silently never animate).
    expect(whole(container)).not.toBe("$14,820");

    document.body.removeChild(container);
  });

  it("a session that has already played goes straight to the final value with no reset", async () => {
    sessionStorage.setItem("money-count:hydrate-2", "1");

    const html = renderToString(<App tripId="hydrate-2" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    expect(whole(container)).toBe("$14,820");

    const onRecoverableError = (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error));
    };

    await act(async () => {
      hydrateRoot(container, <App tripId="hydrate-2" />, { onRecoverableError });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Static: stays at the final value throughout.
    expect(whole(container)).toBe("$14,820");

    document.body.removeChild(container);
  });
});
