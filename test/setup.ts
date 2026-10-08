import '@testing-library/jest-dom'
import { afterAll, afterEach, vi } from 'vitest'

function matchMediaStub(resolve: (query: string) => boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: resolve(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

/**
 * Overrides matchMedia's `matches` result for the rest of the current test —
 * for tests that need a specific breakpoint/preference other than this
 * file's default. Pass a predicate over the query string, or a plain boolean
 * to apply to every query.
 */
export function setMatchMedia(matches: boolean | ((query: string) => boolean)) {
  window.matchMedia = matchMediaStub(typeof matches === 'function' ? matches : () => matches)
}

// `@radix-ui/react-avatar`'s AvatarImage waits for a real `new Image()` to
// fire `load`/`error` before it renders anything — jsdom never fires either
// (no network stack), so every AvatarImage-based test would see only the
// fallback, never the photo (Task 2, TravellerAvatar). Stub `window.Image`
// to resolve "loaded" on the next microtask once `src` is set, which is
// close enough to a real browser for component tests; a test that needs to
// simulate a broken image can flip it with `setImageLoadResult('error')`.
let imageLoadResult: 'load' | 'error' = 'load'
export function setImageLoadResult(result: 'load' | 'error') {
  imageLoadResult = result
}

class StubImage extends EventTarget {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  crossOrigin: string | null = null
  referrerPolicy = ''
  private _src = ''
  get src() {
    return this._src
  }
  set src(value: string) {
    this._src = value
    this.complete = false
    this.naturalWidth = 0
    if (!value) return
    queueMicrotask(() => {
      if (imageLoadResult === 'load') {
        this.complete = true
        this.naturalWidth = 1
        this.naturalHeight = 1
      }
      this.dispatchEvent(new Event(imageLoadResult))
    })
  }
}

// DOM-only stubs: the node project (pure .ts tests) has no window.
if (typeof window !== 'undefined') {
  // jsdom does not implement matchMedia; stub it so theme/breakpoint code can
  // read it without throwing. Defaults to "light" / "no match" for every query
  // except Tailwind's `sm` breakpoint ((min-width: 640px)), which the Dialog
  // spring-pop gate (components/ui/dialog.tsx) reads to tell phone from desktop
  // — defaulting that one query to true keeps every *other* existing test's
  // "no match" assumption (dark mode, other breakpoints) exactly as before,
  // while dialog tests get a real desktop viewport unless they opt out.
  if (!window.matchMedia) {
    window.matchMedia = matchMediaStub((query) => query === '(min-width: 640px)')
  }

  // happy-dom implements Element.animate (the Web Animations API), which
  // jsdom does not; framer-motion (motion-dom) feature-detects it and
  // switches to its native-WAAPI driver, whose happy-dom implementation
  // throws "AbortError: The animation was canceled" on teardown and leaves
  // components mid-animation (height stuck at "auto", reveal attributes
  // never set). Deleting it here makes happy-dom match jsdom: motion-dom
  // falls back to its JS-driven animation driver, which both environments
  // support the same way.
  if (window.Element.prototype.animate) {
    // @ts-expect-error — removing a method the WAAPI feature-detect reads.
    delete window.Element.prototype.animate
  }

  // happy-dom ships a real IntersectionObserver constructor; jsdom has none.
  // Reveal-on-scroll components (ShareReveal, MOTION.md S1) feature-detect
  // it and reveal immediately when it's missing — the existing, passing
  // jsdom behaviour this suite is written against. happy-dom's observer
  // never fires a real intersection in a non-rendering test environment, so
  // leaving it in place means those sections never reveal at all. Removing
  // it restores the same "reveal at once" fallback both environments relied
  // on before.
  if (window.IntersectionObserver) {
    // @ts-expect-error — removing a constructor the feature-detect reads.
    delete window.IntersectionObserver
  }

  // Radix relies on these in jsdom for some interactions.
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn()
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  }

  // @ts-expect-error — a test-only stand-in, not a full Image implementation.
  window.Image = StubImage
}

afterEach(() => {
  imageLoadResult = 'load'
})

// FB-08: @radix-ui/react-focus-scope's FocusScope schedules a `setTimeout(…,
// 0)` on unmount that dispatches a CustomEvent on its (by then detached)
// container (node_modules/@radix-ui/react-focus-scope/dist/index.mjs ~86-96).
// If a test file's last test unmounts a dialog, Vitest tears the jsdom
// environment down for that file before that timer fires, so the dispatch
// hits a dead realm and "dispatchEvent" throws as an unhandled error that
// surfaces against a later/unrelated file. Drain pending zero-delay timers
// once this file's tests are done, before the environment goes away — real
// timers first, in case a test left fake timers on, which would otherwise
// leave this wait permanently pending.
afterAll(async () => {
  if (vi.isFakeTimers()) {
    vi.useRealTimers()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
})
