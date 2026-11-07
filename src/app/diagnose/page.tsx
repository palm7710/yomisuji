import type { Metadata } from 'next';
import { BOOKS, THEMES } from '@/data/books';
import { getBooksMeta } from '@/lib/googleBooks';
import type { ClientBookMeta } from '@/components/BookCover';
import { Picker } from './Picker';

export const metadata: Metadata = { title: '本を選ぶ｜読み筋診断（仮）' };

// ビルド時にGoogle Booksへつながらなくても表紙なしで固定されないよう、表示のたびに組み立てる。
// Google Books の返り値自体は fetch のキャッシュで1日使い回す。
export const dynamic = 'force-dynamic';

export default async function DiagnosePage() {
  const metas = await getBooksMeta(BOOKS);
  // クライアントに渡すのは表示に必要な項目だけ
  const clientMetas: Record<string, ClientBookMeta | null> = Object.fromEntries(
    Object.entries(metas).map(([id, m]) => [id, m ? { thumbnail: m.thumbnail, infoLink: m.infoLink, publisher: m.publisher } : null]),
  );
  return <Picker books={BOOKS} themes={[...THEMES]} metas={clientMetas} />;
}
