import type { PublicBookMeta } from '@/lib/googleBooks';

const COLORS = ['#2e4a73', '#7a3b2e', '#3d6a4c', '#5b3f78', '#6b4a2e', '#1e1c19', '#2f5f6b'];

function colorFor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

type CoverBook = Pick<PublicBookMeta, 'title' | 'thumbnail' | 'infoLink'>;

/** 表紙。Google Books の表紙があればそれを、なければ書名だけの表紙を出す */
export function CoverImage({ book }: { book: CoverBook }) {
  return (
    <span className="cover">
      {book.thumbnail ? (
        // Google Books の画像は外部ドメインなので、最適化を通さずそのまま出す
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="cover-text" style={{ background: colorFor(book.title) }} aria-hidden="true">
          {book.title}
        </span>
      )}
    </span>
  );
}

/** 表紙＋Google Books へのリンク（ブランドガイドラインにより、各書籍にリンクを付ける） */
export function LinkedCover({ book }: { book: CoverBook }) {
  return (
    <a href={book.infoLink} target="_blank" rel="noopener noreferrer" aria-label={`『${book.title}』をGoogle Booksで見る`}>
      <CoverImage book={book} />
    </a>
  );
}

export function GoogleAttribution() {
  return (
    <p className="attribution">
      書誌情報・表紙画像：Google Books（Powered by Google）
    </p>
  );
}

/** AIが作る結果であることの注意 */
export function AiNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className="ai-notice" role="note">
      <b>AIが作る診断です。</b>
      {compact
        ? '同じ本を選んでも、診断するたびに結果が変わることがあります。'
        : '本ごとのタグ付け・分析・おすすめはAI（DeepSeek）が行うため、同じ本を選んでも診断するたびにタイプや説明が変わることがあります。おすすめの本は Google Books で実在を確かめたものだけを表示しています。'}
    </p>
  );
}
