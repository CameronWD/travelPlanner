import '@testing-library/jest-dom'
import { vi } from 'vitest'

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
