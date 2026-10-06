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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'test/integration/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
