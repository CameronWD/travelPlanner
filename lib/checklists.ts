/**
 * Pure helpers for checklist operations.
 *
 * Sort contract:
 *   - Primary display order is **sortOrder ascending** (manual order). This is
 *     what the checklist page uses by default: items appear in the order the
 *     user placed them, regardless of completion or due-date.
 *
 *   - `sortByDueDate` provides an alternative "by due date" view: items with a
 *     dueDate sort ascending (earlier first); items without a dueDate sort
 *     after all dated items (nulls last). Ties and null-dated items are
 *     secondarily sorted by sortOrder ascending.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistItemLike {
  sortOrder: number;
  dueDate?: string | null;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort checklist items by sortOrder ascending (stable manual order).
 * Returns a new array; does not mutate the input.
 */
export function sortChecklist<T extends ChecklistItemLike>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Sort checklist items by dueDate ascending, nulls last.
 * Within the same dueDate (or both null), falls back to sortOrder ascending.
 * Returns a new array; does not mutate the input.
 */
export function sortByDueDate<T extends ChecklistItemLike>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aHasDate = a.dueDate != null && a.dueDate !== "";
    const bHasDate = b.dueDate != null && b.dueDate !== "";

    if (aHasDate && bHasDate) {
      // Both have dates: compare lexicographically (YYYY-MM-DD is sortable)
      const dateCmp = a.dueDate!.localeCompare(b.dueDate!);
      if (dateCmp !== 0) return dateCmp;
    } else if (aHasDate && !bHasDate) {
      // a has a date, b does not → a comes first
      return -1;
    } else if (!aHasDate && bHasDate) {
      // b has a date, a does not → b comes first
      return 1;
    }

    // Both null or same date: secondary sort by sortOrder
    return a.sortOrder - b.sortOrder;
  });
}

// ---------------------------------------------------------------------------
// Template merging
// ---------------------------------------------------------------------------

/**
 * Given the existing texts already on the packing list and the template texts
 * to apply, returns ONLY the template texts that are NOT already present.
 *
 * Rules:
 *   - Case-insensitive comparison (after trim).
 *   - Deduplicates within the template too: if the template itself contains
 *     the same text twice, only the first occurrence is returned.
 *   - Returns texts that are new (not in existing) in their original form (not
 *     lower-cased), preserving the user's capitalisation from the template.
 */
export function mergeTemplateTexts(
  existingTexts: string[],
  templateTexts: string[],
): string[] {
  // Build a set of lower-cased existing texts for O(1) lookup
  const existingLower = new Set(existingTexts.map((t) => t.trim().toLowerCase()));

  const result: string[] = [];
  const seenLower = new Set<string>();

  for (const text of templateTexts) {
    const lower = text.trim().toLowerCase();

    // Skip blanks
    if (!lower) continue;

    // Skip if already in the trip's existing items
    if (existingLower.has(lower)) continue;

    // Skip duplicates within the template itself
    if (seenLower.has(lower)) continue;

    seenLower.add(lower);
    result.push(text.trim());
  }

  return result;
}
