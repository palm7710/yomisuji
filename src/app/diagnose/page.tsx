import type { Metadata } from 'next';
import { getVolume, toPublic, type SearchBookMeta } from '@/lib/googleBooks';
import { MAX_BOOKS } from '@/lib/scoring';
import { loadResult } from '@/lib/store';
import { Picker } from './Picker';

export const metadata: Metadata = { title: '本を選ぶ｜読み筋診断（仮）' };

type SearchParams = Promise<{ from?: string; add?: string }>;

/**
 * 結果ページの「読んだら、この本も入れて診断し直す」から来たとき、
 * 前回選んだ本＋読んだ本を最初から並べておく
 */
async function initialBooks(from?: string, add?: string): Promise<SearchBookMeta[] | undefined> {
  if (!from) return undefined;
  const prev = await loadResult(from);
  if (!prev) return undefined;
  // 結果に保存した題名はシリーズ名に置き換え済みなので、そのまま表示名として引き継ぐ
  const books: SearchBookMeta[] = prev.books.map((b) => ({
    volumeId: b.volumeId,
    title: b.title,
    authors: b.authors,
    publisher: b.publisher,
    publishedDate: b.publishedDate,
    thumbnail: b.thumbnail,
    infoLink: b.infoLink,
    isbn: b.isbn,
    seriesTitle: b.title,
  }));
  const added = add && !books.some((b) => b.volumeId === add) ? await getVolume(add) : null;
  if (!added) return books.slice(0, MAX_BOOKS);
  // 上限を超えるときは、新しく読んだ本を残して前回の本を減らす
  return [...books.slice(0, MAX_BOOKS - 1), toPublic(added)];
}

export default async function DiagnosePage({ searchParams }: { searchParams: SearchParams }) {
  const { from, add } = await searchParams;
  const initial = await initialBooks(from, add);
  return <Picker initial={initial} key={initial ? `${from}:${add ?? ''}` : 'new'} />;
}
