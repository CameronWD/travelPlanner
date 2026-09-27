import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'

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

/**
 * Overrides matchMedia's `matches` result for the rest of the current test —
 * for tests that need a specific breakpoint/preference other than this
 * file's default. Pass a predicate over the query string, or a plain boolean
 * to apply to every query.
 */
export function setMatchMedia(matches: boolean | ((query: string) => boolean)) {
  window.matchMedia = matchMediaStub(typeof matches === 'function' ? matches : () => matches)
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

// @ts-expect-error — a test-only stand-in, not a full Image implementation.
window.Image = StubImage

afterEach(() => {
  imageLoadResult = 'load'
})
