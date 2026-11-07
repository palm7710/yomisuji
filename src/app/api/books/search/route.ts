import { NextResponse } from 'next/server';
import { searchBooks, toPublic } from '@/lib/googleBooks';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (q.trim().length < 1) return NextResponse.json({ books: [] });
  const books = await searchBooks(q, 20);
  return NextResponse.json(
    { books: books.map(toPublic) },
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } },
  );
}
