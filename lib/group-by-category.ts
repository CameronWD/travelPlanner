import { CATEGORIES, type Category } from "@/lib/categories";

export interface CategoryGroup<T> {
  category: Category;
  label: string;
  items: T[];
}

/** Groups in the canonical CATEGORIES order, dropping empty groups; unknown values file under Other. */
export function groupByCategory<T extends { category: string }>(items: T[]): CategoryGroup<T>[] {
  const known = new Set<string>(CATEGORIES.map((c) => c.value));
  const buckets = new Map<Category, T[]>();
  for (const it of items) {
    const key = (known.has(it.category) ? it.category : "OTHER") as Category;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(it);
  }
  return CATEGORIES.filter((c) => buckets.has(c.value)).map((c) => ({
    category: c.value,
    label: c.label,
    items: buckets.get(c.value)!,
  }));
}
