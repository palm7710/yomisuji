// 診断ロジック。同じ入力なら必ず同じ結果を返す（乱数・現在時刻・外部APIを使わない）。
// 要件ドキュメント「診断ロジック要件」の計算をそのまま実装している。

import { BOOKS, BOOK_BY_ID, type Book, type Genre } from '@/data/books';
import {
  AFTERTASTE_MODIFIERS,
  AFTERTASTE_TAGS,
  ALL_TAGS,
  CORE_TAGS,
  STYLE_TAGS,
  TAGS,
  TYPE_NAMES,
  type AftertasteTag,
  type CoreTag,
  type StyleTag,
  type TagId,
} from '@/data/tags';

export const LOGIC_VERSION = 1;
export const MIN_BOOKS = 5;
export const MAX_BOOKS = 15;
export const MAX_DISLIKED = 3;

/** 倍率（要件ドキュメントの m と c） */
const FAVORITE_MULTIPLIER = 2;
const DISLIKED_MULTIPLIER = -0.5;
const LIKE_BONUS = 0.5;
/** 得点を0〜100にそろえるときの曲がり具合。大きいほど高得点が出にくい */
const SATURATION_K = 6;
/** 作品リストに少ないタグが、1冊だけで極端に高くならないようにする下駄 */
const RARITY_PRIOR = 0.5;
/** 冊数に関係なく得点をそろえるための基準冊数 */
const REFERENCE_BOOKS = 6;

export interface DiagnosisInput {
  books: string[];
  favorite?: string;
  /** 「どこが好き？」で選んだ選択肢。`<bookId>:<選択肢の番号>` */
  likes?: string[];
  disliked?: string[];
}

export type Confidence = 'clear' | 'leaning' | 'mixed';

export interface Evidence {
  bookId: string;
  /** メインタグの得点への効き（0〜100の整数、合計はおおむね100） */
  share: number;
  /** 「どこが好き？」で選ばれ、メインタグにつながった選択肢 */
  likedLabels: string[];
}

export interface Recommendation {
  bookId: string;
  sharedTags: TagId[];
  surprise: boolean;
}

export interface Diagnosis {
  version: number;
  input: Required<DiagnosisInput>;
  scores: Record<TagId, number>;
  main: CoreTag;
  sub: CoreTag;
  aftertaste: AftertasteTag;
  style: StyleTag;
  typeName: string;
  modifier: string;
  copy: string;
  /** 混合型のとき2つ目のタイプ名 */
  secondTypeName?: string;
  confidence: Confidence;
  majorityGenre: Genre;
  crossGenre: boolean;
  hidden?: CoreTag;
  evidence: Evidence[];
  recommendations: Recommendation[];
  /** 定型文による説明（DeepSeek導入後は、検査に落ちたときの代わりの文として使う） */
  text: {
    summary: string;
    sub: string;
    aftertaste: string;
    style: string;
    hidden?: string;
  };
}

export class InvalidInputError extends Error {}

/** 入力を検査し、重複を除いて並べ替える（同じ選び方なら同じ形にそろえる） */
export function normalizeInput(input: DiagnosisInput): Required<DiagnosisInput> {
  const books = uniqSorted(input.books.filter((id) => id in BOOK_BY_ID));
  if (books.length < MIN_BOOKS) throw new InvalidInputError(`本は${MIN_BOOKS}冊以上選んでください`);
  if (books.length > MAX_BOOKS) throw new InvalidInputError(`本は${MAX_BOOKS}冊までです`);

  const favorite = input.favorite && books.includes(input.favorite) ? input.favorite : '';

  const likes = uniqSorted(
    (input.likes ?? []).filter((key) => {
      const [bookId, idx] = key.split(':');
      const book = BOOK_BY_ID[bookId];
      return book && books.includes(bookId) && book.likes[Number(idx)] !== undefined;
    }),
  );

  const disliked = uniqSorted((input.disliked ?? []).filter((id) => id in BOOK_BY_ID && !books.includes(id))).slice(
    0,
    MAX_DISLIKED,
  );

  return { books, favorite, likes, disliked };
}

function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

/** 作品リスト全体での、タグごとの平均の重み */
const MEAN_WEIGHT: Record<TagId, number> = Object.fromEntries(
  ALL_TAGS.map((t) => [t, BOOKS.reduce((s, b) => s + (b.weights[t] ?? 0), 0) / BOOKS.length]),
) as Record<TagId, number>;

function likedTagsOf(bookId: string, likes: string[]): { tags: Set<TagId>; labels: Map<TagId, string[]> } {
  const tags = new Set<TagId>();
  const labels = new Map<TagId, string[]>();
  const book = BOOK_BY_ID[bookId];
  for (const key of likes) {
    const [id, idx] = key.split(':');
    if (id !== bookId) continue;
    const opt = book.likes[Number(idx)];
    for (const t of opt.tags) {
      tags.add(t);
      labels.set(t, [...(labels.get(t) ?? []), opt.label]);
    }
  }
  return { tags, labels };
}

export function diagnose(raw: DiagnosisInput): Diagnosis {
  const input = normalizeInput(raw);

  // 1. 本ごと・タグごとの寄与を計算する
  const contrib: Record<TagId, Map<string, number>> = Object.fromEntries(
    ALL_TAGS.map((t) => [t, new Map<string, number>()]),
  ) as Record<TagId, Map<string, number>>;
  let multiplierTotal = 0;

  const entries: { book: Book; m: number }[] = [
    ...input.books.map((id) => ({ book: BOOK_BY_ID[id], m: id === input.favorite ? FAVORITE_MULTIPLIER : 1 })),
    ...input.disliked.map((id) => ({ book: BOOK_BY_ID[id], m: DISLIKED_MULTIPLIER })),
  ];

  for (const { book, m } of entries) {
    if (m > 0) multiplierTotal += m;
    const liked = m > 0 ? likedTagsOf(book.id, input.likes).tags : new Set<TagId>();
    for (const t of ALL_TAGS) {
      const w = book.weights[t] ?? 0;
      if (!w) continue;
      const c = liked.has(t) ? 1 : 0;
      contrib[t].set(book.id, m * (1 + LIKE_BONUS * c) * w);
    }
  }

  // 2. 得点（作品リスト全体の多さで割り、冊数の影響をならして0〜100にそろえる）
  const lift = {} as Record<TagId, number>;
  const scores = {} as Record<TagId, number>;
  for (const t of ALL_TAGS) {
    const sum = [...contrib[t].values()].reduce((a, b) => a + b, 0);
    const l = Math.max(0, sum / (MEAN_WEIGHT[t] + RARITY_PRIOR)) * (REFERENCE_BOOKS / Math.max(1, multiplierTotal));
    lift[t] = l;
    scores[t] = Math.round(100 * (1 - Math.exp(-l / SATURATION_K)));
  }

  // 3. タイプ（同点は定義順で決める）
  const rankBy = <T extends TagId>(tags: readonly T[]) =>
    [...tags].sort((a, b) => lift[b] - lift[a] || tags.indexOf(a) - tags.indexOf(b));
  const coreRank = rankBy(CORE_TAGS);
  const main = coreRank[0];
  const sub = coreRank[1];
  const aftertaste = rankBy(AFTERTASTE_TAGS)[0];
  const style = rankBy(STYLE_TAGS)[0];

  // 4. 確からしさ
  const margin = lift[main] > 0 ? (lift[main] - lift[sub]) / lift[main] : 0;
  const signals = input.books.length + (input.favorite ? 1 : 0) + input.likes.length;
  const confidence: Confidence = margin < 0.08 ? 'mixed' : margin >= 0.18 && signals >= 6 ? 'clear' : 'leaning';

  // 5. ジャンルとのズレ
  const selected = input.books.map((id) => BOOK_BY_ID[id]);
  const mainContrib = contrib[main];
  const majorityGenre = pickMajorityGenre(selected, mainContrib);
  const supportingGenres = new Set(
    selected.filter((b) => (b.weights[main] ?? 0) >= 2).map((b) => b.genre),
  );
  const crossGenre = supportingGenres.size >= 2;

  // 6. 隠れた好み：選んだ本のジャンルからは予想しにくいのに得点が高い面白さの核
  let hidden: CoreTag | undefined;
  let hiddenBest = -1;
  for (const t of coreRank.slice(2)) {
    if (scores[t] < 35) continue;
    const total = [...contrib[t].values()].filter((v) => v > 0).reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const outside = [...contrib[t].entries()]
      .filter(([id, v]) => v > 0 && BOOK_BY_ID[id].genre !== majorityGenre)
      .reduce((a, [, v]) => a + v, 0);
    if (outside / total >= 0.5 && scores[t] > hiddenBest) {
      hidden = t;
      hiddenBest = scores[t];
    }
  }

  // 7. 根拠の本
  const evidence = buildEvidence(main, mainContrib, input.likes);

  // 8. おすすめ
  const recommendations = recommend(input, scores, main, selected);

  const type = TYPE_NAMES[main];
  const modifier = AFTERTASTE_MODIFIERS[aftertaste];

  return {
    version: LOGIC_VERSION,
    input,
    scores,
    main,
    sub,
    aftertaste,
    style,
    typeName: type.name,
    modifier,
    copy: type.copy,
    secondTypeName: confidence === 'mixed' ? TYPE_NAMES[sub].name : undefined,
    confidence,
    majorityGenre,
    crossGenre,
    hidden,
    evidence,
    recommendations,
    text: buildText({ main, sub, aftertaste, style, hidden, majorityGenre, crossGenre, contrib }),
  };
}

function pickMajorityGenre(books: Book[], mainContrib: Map<string, number>): Genre {
  const count = new Map<Genre, number>();
  const weight = new Map<Genre, number>();
  for (const b of books) {
    count.set(b.genre, (count.get(b.genre) ?? 0) + 1);
    weight.set(b.genre, (weight.get(b.genre) ?? 0) + (mainContrib.get(b.id) ?? 0));
  }
  return [...count.keys()].sort(
    (a, b) =>
      count.get(b)! - count.get(a)! || weight.get(b)! - weight.get(a)! || a.localeCompare(b),
  )[0];
}

function buildEvidence(main: CoreTag, mainContrib: Map<string, number>, likes: string[]): Evidence[] {
  const positive = [...mainContrib.entries()].filter(([, v]) => v > 0);
  const total = positive.reduce((a, [, v]) => a + v, 0);
  return positive
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([bookId, v]) => ({
      bookId,
      share: Math.round((100 * v) / total),
      likedLabels: likedTagsOf(bookId, likes).labels.get(main) ?? [],
    }));
}

function recommend(
  input: Required<DiagnosisInput>,
  scores: Record<TagId, number>,
  main: CoreTag,
  selected: Book[],
): Recommendation[] {
  const excluded = new Set([...input.books, ...input.disliked]);
  const u = ALL_TAGS.map((t) => scores[t]);
  const uNorm = Math.hypot(...u) || 1;
  const selectedGenres = new Set(selected.map((b) => b.genre));

  const ranked = BOOKS.filter((b) => !excluded.has(b.id))
    .map((b) => {
      const v: number[] = ALL_TAGS.map((t) => b.weights[t] ?? 0);
      const cos = v.reduce((s, x, i) => s + x * u[i], 0) / (uNorm * (Math.hypot(...v) || 1));
      const score = cos + 0.15 * ((b.weights[main] ?? 0) / 3);
      return { b, score };
    })
    .sort((a, b) => b.score - a.score || a.b.id.localeCompare(b.b.id));

  const isSurprise = (b: Book) => !selectedGenres.has(b.genre) && (b.weights[main] ?? 0) >= 2;
  const top = ranked.slice(0, 2).map((r) => r.b);
  // 上位2冊にすでに「意外な一冊」があればそれに印を付け、なければ3冊目として探す
  const surpriseInTop = top.find(isSurprise);
  const surpriseCand = surpriseInTop ? undefined : ranked.find((r) => !top.includes(r.b) && isSurprise(r.b));
  const third = surpriseCand?.b ?? ranked.find((r) => !top.includes(r.b))?.b;
  const surpriseBook = surpriseInTop ?? surpriseCand?.b;

  const shared = (b: Book): TagId[] =>
    [...ALL_TAGS]
      .filter((t) => (b.weights[t] ?? 0) >= 2 && scores[t] >= 40)
      .sort((x, y) => scores[y] - scores[x] || ALL_TAGS.indexOf(x) - ALL_TAGS.indexOf(y))
      .slice(0, 2);

  return [...top, ...(third ? [third] : [])].map((b) => ({
    bookId: b.id,
    sharedTags: shared(b),
    surprise: b === surpriseBook,
  }));
}

function topContributor(contrib: Map<string, number>): string | undefined {
  return [...contrib.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function buildText(p: {
  main: CoreTag;
  sub: CoreTag;
  aftertaste: AftertasteTag;
  style: StyleTag;
  hidden?: CoreTag;
  majorityGenre: Genre;
  crossGenre: boolean;
  contrib: Record<TagId, Map<string, number>>;
}): Diagnosis['text'] {
  // そのジャンルでよくある面白さなら「なかでも」、ジャンルから想像しにくいなら「でも」でつなぐ
  const genreBooks = BOOKS.filter((b) => b.genre === p.majorityGenre);
  const typical =
    genreBooks.reduce((s, b) => s + (b.weights[p.main] ?? 0), 0) / Math.max(1, genreBooks.length) >= 1.5;
  const lead = typical ? 'なかでも惹かれているのは' : 'でも惹かれているのは';
  const across = p.crossGenre ? 'ジャンルをまたいで' : '';
  const summary = `ジャンルは${p.majorityGenre}。${lead}、${across}${TAGS[p.main].essence}かもしれません。`;

  const subBook = topContributor(p.contrib[p.sub]);
  const sub = subBook
    ? `『${BOOK_BY_ID[subBook].title}』を選んだのは、${TAGS[p.sub].essence}も好きだからかもしれません。`
    : `${TAGS[p.sub].essence}にも惹かれていそうです。`;

  return {
    summary,
    sub,
    aftertaste: `${TAGS[p.aftertaste].essence}が合いそうです。`,
    style: `${TAGS[p.style].essence}が好きそうです。`,
    hidden: p.hidden ? `選んだ本のジャンルからは意外ですが、実は${TAGS[p.hidden].essence}にも惹かれていそうです。` : undefined,
  };
}
