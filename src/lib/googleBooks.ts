// Google Books API から書誌情報（表紙・出版社など）を取る。サーバー側だけで使う。
// - 作品の特定：src/data/google-volume-ids.json に volumeId があればそれを使い、なければ書名と著者で検索する
// - 取得結果は Next.js のデータキャッシュに1日保存する（同じ本を何度も取りにいかない）
// - 取れなかったときは null を返し、画面は書名だけの表紙で表示を続ける
//
// Google Books のブランドガイドライン：結果を表示するときは「Powered by Google」を添え、
// 各書籍から Google Books のページへリンクする（https://developers.google.com/books/branding）

import 'server-only';
import type { Book } from '@/data/books';
import volumeIds from '@/data/google-volume-ids.json';

// GOOGLE_BOOKS_API_BASE は開発・試験用（模擬サーバーに向けるとき）。通常は未設定でよい
const API = process.env.GOOGLE_BOOKS_API_BASE ?? 'https://www.googleapis.com/books/v1/volumes';
const REVALIDATE_SECONDS = 60 * 60 * 24;
const TIMEOUT_MS = 4000;

export interface BookMeta {
  volumeId: string;
  title: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  thumbnail?: string;
  /** Google Books の書籍ページ。画面では必ずこのリンクを付ける */
  infoLink: string;
}

interface VolumeJson {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    imageLinks?: Record<string, string>;
    infoLink?: string;
    canonicalVolumeLink?: string;
  };
}

/** API の1冊分の返り値を、画面で使う形に直す */
export function parseVolume(v: VolumeJson): BookMeta | null {
  const info = v.volumeInfo;
  if (!v.id || !info?.title) return null;
  const rawThumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
  return {
    volumeId: v.id,
    title: info.title,
    authors: info.authors ?? [],
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    thumbnail: rawThumb ? toHttps(rawThumb).replace('&edge=curl', '') : undefined,
    infoLink: toHttps(info.infoLink ?? info.canonicalVolumeLink ?? `https://books.google.com/books?id=${v.id}`),
  };
}

function toHttps(url: string): string {
  return url.replace(/^http:\/\/(?!localhost[:/])/, 'https://');
}

/** 比較用に、空白・記号・全角半角の違いをならす */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・、。,.:：!！?？「」『』()（）\-‐―〜~]/g, '');
}

/** 検索結果から、作品リストの本にいちばん合う1冊を選ぶ。合うものがなければ null */
export function pickBestMatch(book: Pick<Book, 'title' | 'author'>, items: VolumeJson[]): BookMeta | null {
  const want = normalizeTitle(book.title);
  const wantAuthor = normalizeTitle(book.author);
  const scored = items
    .map(parseVolume)
    .filter((m): m is BookMeta => m !== null)
    .map((m) => {
      const t = normalizeTitle(m.title);
      const titleScore = t === want ? 3 : t.startsWith(want) ? 2 : t.includes(want) ? 1 : 0;
      const authorScore = m.authors.some((a) => {
        const n = normalizeTitle(a);
        return n.includes(wantAuthor) || wantAuthor.includes(n);
      })
        ? 2
        : 0;
      return { m, titleScore, score: titleScore * 10 + authorScore * 5 + (m.thumbnail ? 1 : 0) };
    })
    .filter((x) => x.titleScore > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.m ?? null;
}

function withKey(url: string): string {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(withKey(url), {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[googleBooks] ${res.status} ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[googleBooks] failed ${url}: ${(e as Error).message}`);
    return null;
  }
}

export function buildSearchUrl(book: Pick<Book, 'title' | 'author'>): string {
  const q = `intitle:${book.title} inauthor:${book.author}`;
  return `${API}?q=${encodeURIComponent(q)}&printType=books&maxResults=10&langRestrict=ja`;
}

export async function getBookMeta(book: Book): Promise<BookMeta | null> {
  const id = (volumeIds as Record<string, string>)[book.id];
  if (id) {
    const v = await getJson<VolumeJson>(`${API}/${encodeURIComponent(id)}`);
    const meta = v ? parseVolume(v) : null;
    if (meta) return meta;
  }
  const found = await getJson<{ items?: VolumeJson[] }>(buildSearchUrl(book));
  return found?.items ? pickBestMatch(book, found.items) : null;
}

/** 複数の本をまとめて取る。並行して取りにいくので、つながらないときも待ち時間は1冊分（最大4秒）で済む */
export async function getBooksMeta(books: Book[]): Promise<Record<string, BookMeta | null>> {
  const metas = await Promise.all(books.map(getBookMeta));
  return Object.fromEntries(books.map((b, i) => [b.id, metas[i]]));
}
