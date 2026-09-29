// Supabase caps a single select (1,000 rows by default), so totals summed from one query silently
// drop rows once a table grows (XP-002). This reads every page. The query passed in must have a
// stable order so pages don't overlap. No imports so it can be unit tested with `node --test`.

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
