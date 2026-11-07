import type { Book, Genre } from '@/data/books';
import type { BookMeta } from '@/lib/googleBooks';

// 表紙が取れないときの代わりの色（ジャンルごと）
const GENRE_COLORS: Record<Genre, string> = {
  SF: '#2e4a73',
  ミステリー: '#1e1c19',
  文芸: '#7a3b2e',
  ノンフィクション: '#3d6a4c',
  ビジネス: '#5b3f78',
  数学読み物: '#2f5f6b',
  企業小説: '#6b4a2e',
};

export type ClientBookMeta = Pick<BookMeta, 'thumbnail' | 'infoLink' | 'publisher'>;

/** 表紙。Google Books の表紙があればそれを、なければ書名だけの表紙を出す */
export function CoverImage({ book, meta }: { book: Book; meta?: ClientBookMeta | null }) {
  return (
    <span className="cover">
      {meta?.thumbnail ? (
        // Google Books の画像は外部ドメインなので、最適化を通さずそのまま出す
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="cover-text" style={{ background: GENRE_COLORS[book.genre] }} aria-hidden="true">
          {book.title}
        </span>
      )}
    </span>
  );
}

/** 表紙＋Google Books へのリンク（ブランドガイドラインにより、各書籍にリンクを付ける） */
export function LinkedCover({ book, meta }: { book: Book; meta?: ClientBookMeta | null }) {
  if (!meta?.infoLink) return <CoverImage book={book} meta={meta} />;
  return (
    <a href={meta.infoLink} target="_blank" rel="noopener noreferrer" aria-label={`『${book.title}』をGoogle Booksで見る`}>
      <CoverImage book={book} meta={meta} />
    </a>
  );
}

export function GoogleAttribution() {
  return (
    <p className="attribution">
      書誌情報・表紙画像：Google Books（Powered by Google）
      <br />
      表紙をタップすると Google Books のページが開きます
    </p>
  );
}
