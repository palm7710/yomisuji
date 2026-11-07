// Google Books API から本を探す・書誌情報を取る。サーバー側だけで使う。
// - 本選び画面の検索、選ばれた本の詳しい情報（分類・内容紹介）、AIが挙げたおすすめ本の実在確認に使う
// - 取得結果は Next.js のデータキャッシュに1日保存する
// - 取れなかったときは null / 空配列を返し、呼び出し側で扱う
//
// Google Books のブランドガイドライン：結果を表示するときは「Powered by Google」を添え、
// 各書籍から Google Books のページへリンクする（https://developers.google.com/books/branding）

import 'server-only';

// GOOGLE_BOOKS_API_BASE は開発・試験用（模擬サーバーに向けるとき）。通常は未設定でよい
const API = process.env.GOOGLE_BOOKS_API_BASE ?? 'https://www.googleapis.com/books/v1/volumes';
const REVALIDATE_SECONDS = 60 * 60 * 24;
const TIMEOUT_MS = 5000;

/** 画面とAIに渡す、1冊分の書誌情報 */
export interface BookMeta {
  volumeId: string;
  title: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  thumbnail?: string;
  /** Google Books の書籍ページ。画面では必ずこのリンクを付ける */
  infoLink: string;
  categories?: string[];
  /** 内容紹介（AIへの手がかりとしてだけ使い、画面には出さない） */
  description?: string;
  /** Google Books上の評価。検索結果を人気順に近づけるためだけに使う */
  ratingsCount?: number;
  averageRating?: number;
  /** Google Booksが持つシリーズ情報。題名が違う小説も同じシリーズにまとめる */
  seriesId?: string;
  seriesOrder?: number;
}

/** ブラウザに渡してよい項目だけに絞った形 */
export type PublicBookMeta = Omit<BookMeta, 'description' | 'categories' | 'ratingsCount' | 'averageRating' | 'seriesId' | 'seriesOrder'>;

/** 検索画面用。同じ漫画シリーズをまとめたときだけシリーズ名と件数が入る。 */
export interface SearchBookMeta extends PublicBookMeta {
  seriesTitle?: string;
  seriesCount?: number;
}

export function toPublic(m: BookMeta): PublicBookMeta {
  const { description: _d, categories: _c, ratingsCount: _rc, averageRating: _ar, seriesId: _si, seriesOrder: _so, ...rest } = m;
  return rest;
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
    categories?: string[];
    description?: string;
    ratingsCount?: number;
    averageRating?: number;
    seriesInfo?: {
      volumeSeries?: { seriesId?: string; orderNumber?: number }[];
    };
  };
}

/** API の1冊分の返り値を、使う形に直す */
export function parseVolume(v: VolumeJson): BookMeta | null {
  const info = v.volumeInfo;
  if (!v.id || !info?.title) return null;
  const rawThumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
  return {
    volumeId: v.id,
    title: info.subtitle && info.title.length < 6 ? `${info.title} ${info.subtitle}` : info.title,
    authors: info.authors ?? [],
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    thumbnail: rawThumb ? toHttps(rawThumb).replace('&edge=curl', '') : undefined,
    infoLink: toHttps(info.infoLink ?? info.canonicalVolumeLink ?? `https://books.google.com/books?id=${v.id}`),
    categories: info.categories,
    description: info.description ? stripHtml(info.description).slice(0, 600) : undefined,
    ratingsCount: info.ratingsCount,
    averageRating: info.averageRating,
    seriesId: info.seriesInfo?.volumeSeries?.[0]?.seriesId,
    seriesOrder: info.seriesInfo?.volumeSeries?.[0]?.orderNumber,
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
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

/** 書名の末尾にある巻数を分ける。「3月のライオン 17」は題名中の3を残して17だけ外す。 */
export function splitSeriesTitle(title: string): { title: string; volume?: number } {
  const value = title.normalize('NFKC').trim();
  const patterns = [
    /^(.*?)[\s　]*[（(](\d+|上|中|下|前|後)[）)](?:[\s　]*[（(][^）)]+[）)])+\s*$/i,
    /^(.*?)[\s　]+(?:第\s*)?(\d+|上|中|下|前|後)\s*(?:巻|集|編|篇|部)?(?:[\s　]*[（(][^）)]+[）)])+\s*$/i,
    /^(.*?)[\s　]*(?:第\s*)?(\d+)\s*(?:巻|集)\s*$/i,
    /^(.*?)[\s　]*[（(](\d+)[）)]\s*$/i,
    /^(.*?)[\s　]+(?:vol(?:ume)?\.?\s*|book\s*)?(\d+)\s*$/i,
    /^(.*?)[\s　]*(上|中|下|前|後)(?:巻|編|篇)\s*$/,
    /^(.*?)[\s　]+(上|中|下|前|後)\s*$/,
    /^(.*?)[\s　]+(?:第\s*)?(\d+)\s*部\s*$/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const base = match?.[1]?.trim();
    if (base) {
      const partOrder: Record<string, number> = { 上: 1, 前: 1, 中: 2, 下: 3, 後: 3 };
      return { title: base, volume: partOrder[match![2]] ?? Number(match![2]) };
    }
  }
  return { title: value };
}

function commonSeriesTitle(titles: string[], fallback: string): string {
  if (titles.length < 2) return fallback;
  let prefix = titles[0].normalize('NFKC');
  for (const title of titles.slice(1)) {
    const value = title.normalize('NFKC');
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const cleaned = prefix.replace(/[\s・、,:：!！?？「」『』()（）\-‐―〜~]+$/g, '').replace(/[との]$/, '').trim();
  return normalizeTitle(cleaned).length >= 3 ? cleaned : fallback;
}

/** 巻違い・上下巻・Google Books上の同一シリーズを作品単位にまとめ、人気順に近い順で返す。 */
export function collapseBookSeries(books: BookMeta[]): SearchBookMeta[] {
  const groups = new Map<string, { title: string; entries: { book: BookMeta; volume?: number; order: number }[] }>();
  books.forEach((book, order) => {
    const series = splitSeriesTitle(book.title);
    const author = normalizeTitle(book.authors[0] ?? book.publisher ?? '');
    const key = book.seriesId ? `series:${book.seriesId}` : `title:${normalizeTitle(series.title)}|${author}`;
    const group = groups.get(key) ?? { title: series.title, entries: [] };
    group.entries.push({ book, volume: book.seriesOrder ?? series.volume, order });
    groups.set(key, group);
  });

  return [...groups.values()]
    .sort((a, b) => {
      const popularity = (g: typeof a) => Math.max(0, ...g.entries.map((e) => e.book.ratingsCount ?? 0));
      const rating = (g: typeof a) => Math.max(0, ...g.entries.map((e) => e.book.averageRating ?? 0));
      return popularity(b) - popularity(a) || rating(b) - rating(a) || Math.min(...a.entries.map((e) => e.order)) - Math.min(...b.entries.map((e) => e.order));
    })
    .map((group) => {
      const representative = [...group.entries].sort((a, b) => {
        if (a.volume === undefined && b.volume !== undefined) return -1;
        if (a.volume !== undefined && b.volume === undefined) return 1;
        return (a.volume ?? Number.MAX_SAFE_INTEGER) - (b.volume ?? Number.MAX_SAFE_INTEGER) || a.order - b.order;
      })[0].book;
      const publicBook = toPublic(representative);
      if (group.entries.length === 1) return publicBook;
      const title = commonSeriesTitle(group.entries.map((e) => splitSeriesTitle(e.book.title).title), group.title);
      return { ...publicBook, seriesTitle: title, seriesCount: group.entries.length };
    });
}

/** 検索結果から、書名と著者にいちばん合う1冊を選ぶ。書名が合うものがなければ null */
export function pickBestMatch(want: { title: string; author: string }, items: VolumeJson[]): BookMeta | null {
  const t0 = normalizeTitle(want.title);
  const a0 = normalizeTitle(want.author);
  const scored = items
    .map(parseVolume)
    .filter((m): m is BookMeta => m !== null)
    .map((m) => {
      const t = normalizeTitle(m.title);
      const titleScore = t === t0 ? 3 : t.startsWith(t0) ? 2 : t.includes(t0) || (t.length >= 2 && t0.includes(t)) ? 1 : 0;
      const authorHit =
        a0.length > 0 &&
        m.authors.some((a) => {
          const n = normalizeTitle(a);
          return n.length > 0 && (n.includes(a0) || a0.includes(n));
        });
      return { m, titleScore, authorHit, score: titleScore * 10 + (authorHit ? 10 : 0) + (m.thumbnail ? 1 : 0) };
    })
    // 書名が合い、かつ（著者も合う、または書名が完全一致）のものだけ採る
    .filter((x) => x.titleScore > 0 && (x.authorHit || x.titleScore === 3 || a0.length === 0))
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
      console.warn(`[googleBooks] ${res.status} ${url.replace(/key=[^&]+/, 'key=***')}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[googleBooks] failed ${url.replace(/key=[^&]+/, 'key=***')}: ${(e as Error).message}`);
    return null;
  }
}

/** 本選び画面の検索。日本語の本を優先し、同じ本の重複（版違い）はまとめる */
export async function searchBooks(query: string, max = 20): Promise<BookMeta[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const json = await getJson<{ items?: VolumeJson[] }>(
    `${API}?q=${encodeURIComponent(q)}&printType=books&maxResults=${Math.min(40, max)}&langRestrict=ja&orderBy=relevance`,
  );
  const seen = new Set<string>();
  const out: BookMeta[] = [];
  for (const v of json?.items ?? []) {
    const m = parseVolume(v);
    if (!m) continue;
    const key = normalizeTitle(m.title) + '|' + normalizeTitle(m.authors[0] ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function buildFindUrl(want: { title: string; author: string }): string {
  const q = want.author ? `intitle:${want.title} inauthor:${want.author}` : `intitle:${want.title}`;
  return `${API}?q=${encodeURIComponent(q)}&printType=books&maxResults=10&langRestrict=ja`;
}

/** 書名と著者から本を1冊特定する（棚の本・AIのおすすめの実在確認に使う） */
export async function findBook(want: { title: string; author: string }): Promise<BookMeta | null> {
  const found = await getJson<{ items?: VolumeJson[] }>(buildFindUrl(want));
  return found?.items ? pickBestMatch(want, found.items) : null;
}

/** volumeId から1冊を取る */
export async function getVolume(volumeId: string): Promise<BookMeta | null> {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(volumeId)) return null;
  const v = await getJson<VolumeJson>(`${API}/${encodeURIComponent(volumeId)}`);
  return v ? parseVolume(v) : null;
}
