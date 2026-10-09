import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'

// Spec 2026-10-06 §I: app code runs through the React Compiler in tests, as
// in production, so a component the compiler breaks fails here. Test files
// themselves stay uncompiled. The preset targets only "client" environments
// by default, which Vitest's jsdom runs are not, so that hook is widened.
// Next compiles browser code only (no server chunk carries compiler output),
// so only "use client" modules are compiled here; Server Components stay
// plain functions, which their tests call directly (`await Page()`).
const base = reactCompilerPreset()
const compiler = {
  ...base,
  rolldown: {
    ...base.rolldown,
    applyToEnvironmentHook: () => true,
    filter: {
      code: /^\s*["']use client["']/m,
      id: { exclude: [/\.test\.tsx?$/, /\/node_modules\//] },
    },
  },
}

export default defineConfig({
  plugins: [react(), babel({ presets: [compiler] })],
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules', '.next', 'test/integration/**'],
    // Spec 2026-10-08 §B: pure tests skip the DOM's per-file startup cost.
    // A .ts test that needs a DOM opts in with `// @vitest-environment jsdom`.
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['**/*.test.ts'] } },
      // Spec 2026-10-08 §C: happy-dom kept over jsdom for this project by the
      // spec's rule — dom/jsdom 103s -> dom/happy-dom 70s (<= 0.7x), 2 test
      // files mechanically edited (<= 15), 5 opted back to jsdom via a
      // line-1 `// @vitest-environment jsdom` docblock (<= 20), fully green
      // at the same 3,531-test count. See test/setup.ts for the two shared
      // polyfills (Element.animate, IntersectionObserver) this trial added.
      { extends: true, test: { name: 'dom', environment: 'happy-dom', include: ['**/*.test.tsx'] } },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
