// app/utils/pagination.ts
export function parsePageParams(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(48, Math.max(12, Number(url.searchParams.get("pageSize") ?? "24")));
  const q = (url.searchParams.get("q") ?? "").trim();
  const tag = (url.searchParams.get("tag") ?? "").trim();
  const categoryId = (url.searchParams.get("category") ?? "").trim();
  return { page, pageSize, q, tag, categoryId };
}

export function toRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}
