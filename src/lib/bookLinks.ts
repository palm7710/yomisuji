// 「次に読むなら」の本から、外のサービスへ飛ぶリンクを作る。
// 感想は他サイトの文章を取り込まず、リンクで案内するだけにする（各サイトの規約に沿うため）

export interface BookLinkInput {
  title: string;
  authors: string[];
  isbn?: string;
}

export interface BookLink {
  key: 'library' | 'bookmeter' | 'booklog' | 'amazon';
  label: string;
  url: string;
}

/** ISBN-13（978で始まるもの）を ISBN-10 に直す。カーリルの本のページは10桁で開ける */
export function toIsbn10(isbn: string): string | undefined {
  if (/^\d{9}[\dX]$/.test(isbn)) return isbn;
  if (!/^978\d{10}$/.test(isbn)) return undefined;
  const body = isbn.slice(3, 12);
  const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? 'X' : String(check));
}

export function bookLinks(book: BookLinkInput): BookLink[] {
  const words = [book.title, book.authors[0]].filter(Boolean).join(' ');
  const q = encodeURIComponent(words);
  const isbn10 = book.isbn ? toIsbn10(book.isbn) : undefined;
  return [
    {
      key: 'library',
      label: '図書館で探す（カーリル）',
      url: isbn10 ? `https://calil.jp/book/${isbn10}` : `https://calil.jp/search?q=${q}`,
    },
    { key: 'bookmeter', label: '読書メーター', url: `https://bookmeter.com/search?keyword=${q}` },
    { key: 'booklog', label: 'ブクログ', url: `https://booklog.jp/search?keyword=${q}` },
    { key: 'amazon', label: 'Amazon', url: `https://www.amazon.co.jp/s?k=${encodeURIComponent(book.isbn ?? words)}&i=stripbooks` },
  ];
}
