import type { Metadata } from 'next';
import { SHELF_BOOKS, THEMES } from '@/data/books';
import { findBook, toPublic, type PublicBookMeta } from '@/lib/googleBooks';
import { Picker, type ShelfItem } from './Picker';

export const metadata: Metadata = { title: '本を選ぶ｜読み筋診断（仮）' };

// ビルド時に Google Books へつながらなくても棚が空のまま固定されないよう、表示のたびに組み立てる。
// Google Books の返り値自体は fetch のキャッシュで1日使い回す。
export const dynamic = 'force-dynamic';

export default async function DiagnosePage() {
  // テーマの棚の本を Google Books で特定する（見つからない本は棚に出さない）
  const found = await Promise.all(SHELF_BOOKS.map((b) => findBook(b)));
  const shelf: ShelfItem[] = SHELF_BOOKS.flatMap((b, i) => {
    const m = found[i];
    return m ? [{ theme: b.theme, book: toPublic(m) as PublicBookMeta }] : [];
  });
  return <Picker themes={[...THEMES]} shelf={shelf} />;
}
