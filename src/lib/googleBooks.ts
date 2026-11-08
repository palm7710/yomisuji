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
  /** ISBN（13桁を優先）。図書館検索のリンクに使う */
  isbn?: string;
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
  /** まとめ表示で代表にした巻。1巻が検索結果にあれば必ず1になる */
  seriesRepresentativeVolume?: number;
  /** 検索語が著者名と一致した本（画面で「〇〇の本」として先に並べる） */
  authorMatch?: boolean;
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
    industryIdentifiers?: { type?: string; identifier?: string }[];
    language?: string;
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
    isbn: pickIsbn(info.industryIdentifiers),
    categories: info.categories,
    description: info.description ? stripHtml(info.description).slice(0, 600) : undefined,
    ratingsCount: info.ratingsCount,
    averageRating: info.averageRating,
    seriesId: info.seriesInfo?.volumeSeries?.[0]?.seriesId,
    seriesOrder: info.seriesInfo?.volumeSeries?.[0]?.orderNumber,
  };
}

function pickIsbn(ids?: { type?: string; identifier?: string }[]): string | undefined {
  const get = (type: string) => ids?.find((x) => x.type === type)?.identifier?.replace(/-/g, '');
  const isbn = get('ISBN_13') ?? get('ISBN_10');
  return isbn && /^(\d{13}|\d{9}[\dX])$/.test(isbn) ? isbn : undefined;
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

const EDITION_WORDS = '文庫版|新装版|新版|完全版|愛蔵版|特装版|限定特装版|限定版|通常版|単行本|電子版|電子特別版|特別版|決定版|合本版';

/**
 * 「文庫版」「〈限定特装版〉」「【映画化記念特典付】」「（新潮文庫）」など、版の違いを表す飾りを書名から外す。
 * 同じ作品の版違いを1件にまとめるために使う
 */
export function stripEdition(title: string): string {
  const stripped = title
    .normalize('NFKC')
    .replace(/【[^】]*】/g, ' ')
    .replace(/[〈<《][^〉>》]*[〉>》]/g, ' ')
    .replace(/[（(][^）)]*(文庫|新書|版|特典)[^）)]*[）)]/g, ' ')
    .replace(new RegExp(`^(?:${EDITION_WORDS})[\\s　]*`), '')
    .replace(new RegExp(`[\\s　]*(?:${EDITION_WORDS})$`), '')
    .replace(/[\s　]+/g, ' ')
    .trim();
  return stripped || title;
}

/** 雑誌・ムックらしい書名 */
function looksLikeMagazine(title: string): boolean {
  return /\[雑誌\]|vol\.?\s*\d|magazine|\d{4}年\s*\d{1,2}月号|月号/i.test(title.normalize('NFKC'));
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

/**
 * 検索語が著者名とどう一致するか。
 * 3: 単著（または2人までの1人目）／2: 2人までの共著／1: アンソロジー・雑誌など大勢の中の1人／0: 一致なし
 */
function authorRank(book: BookMeta, queryKey: string): number {
  if (!queryKey) return 0;
  const keys = book.authors.map(normalizeTitle);
  const hit = keys.indexOf(queryKey);
  if (hit < 0) return 0;
  if (keys.length > 2 || looksLikeMagazine(book.title)) return 1;
  return hit === 0 ? 3 : 2;
}

/**
 * 巻違い・上下巻・版違い（文庫版・特装版など）・Google Books上の同一シリーズを作品単位にまとめ、検索語に合う順に返す。
 * 検索語が著者名と一致するときは、その著者の単著 → 共著 → アンソロジー・雑誌 → ほかの本 の順にする
 * （Google Books の日本語の本には評価数がほとんど入っておらず、人気順には並べられないため）
 */
export function collapseBookSeries(books: BookMeta[], query = ''): SearchBookMeta[] {
  const queryKey = normalizeTitle(query);
  const groups = new Map<string, { title: string; entries: { book: BookMeta; volume?: number; order: number }[] }>();
  books.forEach((book, order) => {
    const series = splitSeriesTitle(stripEdition(book.title));
    const author = normalizeTitle(book.authors[0] ?? book.publisher ?? '');
    const key = book.seriesId ? `series:${book.seriesId}` : `title:${normalizeTitle(series.title)}|${author}`;
    const group = groups.get(key) ?? { title: series.title, entries: [] };
    group.entries.push({ book, volume: book.seriesOrder ?? series.volume, order });
    groups.set(key, group);
  });

  type Group = { title: string; entries: { book: BookMeta; volume?: number; order: number }[] };
  const textMatch = (value: string) => {
    const key = normalizeTitle(value);
    if (!queryKey || !key) return 0;
    if (key === queryKey) return 5;
    if (queryKey.startsWith(key) || key.startsWith(queryKey)) return 4;
    if (queryKey.includes(key) || key.includes(queryKey)) return 3;
    return 0;
  };
  const rankOf = (g: Group) => Math.max(...g.entries.map((e) => authorRank(e.book, queryKey)));
  const match = (g: Group) =>
    Math.max(textMatch(g.title), ...g.entries.flatMap((e) => [textMatch(e.book.title), ...e.book.authors.map(textMatch)]));
  // 著者名で探したとき、題名に著者名が入った本（ガイド本・名言集など）は作品より後ろにする
  const aboutAuthor = (g: Group) => (rankOf(g) >= 2 && normalizeTitle(g.title).includes(queryKey) ? 1 : 0);
  const magazine = (g: Group) => (g.entries.every((e) => looksLikeMagazine(e.book.title)) ? 1 : 0);
  const popularity = (g: Group) => Math.max(0, ...g.entries.map((e) => e.book.ratingsCount ?? 0));
  const rating = (g: Group) => Math.max(0, ...g.entries.map((e) => e.book.averageRating ?? 0));

  return [...groups.values()]
    .sort(
      (a, b) =>
        rankOf(b) - rankOf(a) ||
        aboutAuthor(a) - aboutAuthor(b) ||
        magazine(a) - magazine(b) ||
        match(b) - match(a) ||
        popularity(b) - popularity(a) ||
        // 版や巻がたくさん出ている作品ほど、よく読まれていると見なす
        b.entries.length - a.entries.length ||
        rating(b) - rating(a) ||
        Math.min(...a.entries.map((e) => e.order)) - Math.min(...b.entries.map((e) => e.order)),
    )
    .map((group) => {
      const plainTitle = (e: Group['entries'][number]) => (normalizeTitle(e.book.title) === normalizeTitle(group.title) ? 0 : 1);
      const representativeEntry = [...group.entries].sort((a, b) => {
        // 巻数不明の版より巻数が分かる版を優先し、1巻があれば必ず代表にする
        if (a.volume === undefined && b.volume !== undefined) return 1;
        if (a.volume !== undefined && b.volume === undefined) return -1;
        return (
          (a.volume ?? Number.MAX_SAFE_INTEGER) - (b.volume ?? Number.MAX_SAFE_INTEGER) ||
          // 版違いだけのときは、飾りのない書名・表紙のある版を代表にする
          plainTitle(a) - plainTitle(b) ||
          (a.book.thumbnail ? 0 : 1) - (b.book.thumbnail ? 0 : 1) ||
          a.order - b.order
        );
      })[0];
      const representative = representativeEntry.book;
      const authorMatch = rankOf(group) >= 2 ? { authorMatch: true } : {};
      const publicBook = { ...toPublic(representative), ...authorMatch };
      const cleanTitle = stripEdition(representative.title);
      if (group.entries.length === 1) return cleanTitle === representative.title ? publicBook : { ...publicBook, seriesTitle: cleanTitle };
      const volumes = new Set(group.entries.map((e) => e.volume).filter((v) => v !== undefined));
      const title = commonSeriesTitle(group.entries.map((e) => splitSeriesTitle(stripEdition(e.book.title)).title), group.title);
      // 巻数がない＝版違いだけのまとまり。シリーズとしては扱わず、作品名だけ整える
      if (volumes.size === 0) return { ...publicBook, seriesTitle: title };
      return {
        ...publicBook,
        seriesTitle: title,
        seriesCount: group.entries.length,
        seriesRepresentativeVolume: representativeEntry.volume,
      };
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

/**
 * 著者名として探すための検索語。名前らしい短い語のときだけ作る。
 * 「背筋」のように普通の単語と同じ名前の作家は、ふつうの検索だと題名や内容紹介に負けて出てこないため
 */
export function authorQuery(q: string): string | null {
  if (q.length > 30 || /[:：]/.test(q) || q.split(/\s+/).length > 3) return null;
  return /\s/.test(q) ? `inauthor:"${q}"` : `inauthor:${q}`;
}

/** 本選び画面の検索。書名・キーワードと著者名の両方で探し、日本語の本を優先して、同じ本の重複（版違い）はまとめる */
export async function searchBooks(query: string, max = 20): Promise<BookMeta[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const url = (term: string, n: number) =>
    `${API}?q=${encodeURIComponent(term)}&printType=books&maxResults=${n}&langRestrict=ja&orderBy=relevance`;
  const byAuthor = authorQuery(q);
  const [general, author] = await Promise.all([
    getJson<{ items?: VolumeJson[] }>(url(q, Math.min(40, max))),
    byAuthor ? getJson<{ items?: VolumeJson[] }>(url(byAuthor, 40)) : Promise.resolve(null),
  ]);
  const seen = new Set<string>();
  const out: BookMeta[] = [];
  // 並び順の最終判断は collapseBookSeries（著者名の完全一致を上位にする）に任せる
  for (const v of [...(general?.items ?? []), ...(author?.items ?? [])]) {
    // langRestrict=ja でも台湾版・中国語版などが混ざるので、言語が分かるものは日本語だけにする
    const lang = v.volumeInfo?.language;
    if (lang && lang !== 'ja') continue;
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
