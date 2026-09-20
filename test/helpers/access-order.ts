import { expect, type Mock } from "vitest";

/**
 * Assert the access guard ran BEFORE the write.
 *
 * The pattern this replaces asserted only that `requireTripAccess` was called,
 * which stays green if the guard moves below the mutation — i.e. the test
 * cannot fail for the thing it is named after. Auth ordering is the one class
 * of bug where there is no second chance, so the assertion has to be about
 * order.
 *
 * `mock.invocationCallOrder` is Vitest's monotonically increasing per-call
 * sequence, shared across all mocks, which is what makes cross-mock ordering
 * checkable at all.
 */
export function expectAccessCheckedBeforeWrite(access: Mock, write: Mock): void {
  const accessOrder = access.mock.invocationCallOrder[0];
  const writeOrder = write.mock.invocationCallOrder[0];
  expect(accessOrder, "the access guard was never called").toBeDefined();
  expect(writeOrder, "the write was never called").toBeDefined();
  expect(
    accessOrder < writeOrder,
    `expected the access guard to run before the write, but it ran after ` +
      `(guard #${accessOrder}, write #${writeOrder})`,
  ).toBe(true);
}
