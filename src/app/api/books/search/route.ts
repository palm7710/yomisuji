import { NextResponse } from 'next/server';
import { collapseBookSeries, searchBooks } from '@/lib/googleBooks';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (q.trim().length < 1) return NextResponse.json({ books: [] });
  // 巻数の多い漫画でも、検索画面にはシリーズを1件として最大24件だけ返す
  const books = collapseBookSeries(await searchBooks(q, 40), q).slice(0, 24);
  return NextResponse.json(
    { books },
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } },
  );
}
