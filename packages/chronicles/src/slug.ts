/** URL slugs shared by series, episodes and categories. Same rule as the database check. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export function slugify(input: string, maxLength = 80): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return base || "untitled";
}

export const isValidSlug = (value: string): boolean => SLUG_PATTERN.test(value);

/** Returns `base`, or `base-2`, `base-3`… — the first one not in `taken`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base, 74);
  if (!taken.has(root)) return root;
  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Could not allocate a unique slug");
}
