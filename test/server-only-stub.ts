// vitest stand-in for the `server-only` package (spec 2026-10-06 §X). Its
// real entry throws outside the react-server condition; tests are not a
// client bundle, so they get this empty module — the same move Next's own
// Jest guide makes (node_modules/next/dist/docs/01-app/02-guides/testing/jest.md).
export {};
