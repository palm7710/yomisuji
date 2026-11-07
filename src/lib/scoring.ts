// 得点の計算。AIが本ごとに付けたタグの重みから、タイプ・確からしさ・根拠の本などを出す。
// AIの付け方が毎回少し変わるので結果も変わりうるが、計算そのものは同じ入力なら同じ答えになる。

import {
  AFTERTASTE_MODIFIERS,
  AFTERTASTE_TAGS,
  ALL_TAGS,
  CORE_TAGS,
  STYLE_TAGS,
  TYPE_NAMES,
  type AftertasteTag,
  type CoreTag,
  type Genre,
  type StyleTag,
  type TagId,
} from '@/data/tags';

export const MIN_BOOKS = 5;
export const MAX_BOOKS = 15;
export const MAX_DISLIKED = 3;
export const MAX_LIKE_BOOKS = 3;

const FAVORITE_MULTIPLIER = 2;
const DISLIKED_MULTIPLIER = -0.5;
const LIKE_BONUS = 0.5;
/** 1冊あたりの重みの目安。これで割って、冊数や重みの付け方の差をならす */
const BASELINE_WEIGHT = 1.2;
const SATURATION_K = 4;
const REFERENCE_BOOKS = 6;

export interface TaggedBook {
  id: string;
  title: string;
  genre: Genre;
  weights: Partial<Record<TagId, number>>;
}

export interface ScoringInput {
  books: TaggedBook[];
  disliked: TaggedBook[];
  favorite?: string;
  /** 「どこが好き？」で選ばれたもの。`<bookId>:<面白さの核のタグ>` */
  likes: string[];
}

export type Confidence = 'clear' | 'leaning' | 'mixed';

export interface ScoringResult {
  scores: Record<TagId, number>;
  main: CoreTag;
  sub: CoreTag;
  aftertaste: AftertasteTag;
  style: StyleTag;
  typeName: string;
  secondTypeName?: string;
  modifier: string;
  copy: string;
  confidence: Confidence;
  majorityGenre: Genre;
  crossGenre: boolean;
  hidden?: CoreTag;
  /** メインタグの得点に効いた本（最大3冊）と、その割合（%） */
  evidence: { bookId: string; share: number; liked: boolean }[];
}

export function score(input: ScoringInput): ScoringResult {
  if (input.books.length < MIN_BOOKS) throw new Error(`本は${MIN_BOOKS}冊以上必要です`);

  const likeSet = new Set(input.likes);
  const contrib = Object.fromEntries(ALL_TAGS.map((t) => [t, new Map<string, number>()])) as Record<
    TagId,
    Map<string, number>
  >;
  let multiplierTotal = 0;

  const entries = [
    ...input.books.map((b) => ({ b, m: b.id === input.favorite ? FAVORITE_MULTIPLIER : 1 })),
    ...input.disliked.map((b) => ({ b, m: DISLIKED_MULTIPLIER })),
  ];
  for (const { b, m } of entries) {
    if (m > 0) multiplierTotal += m;
    for (const t of ALL_TAGS) {
      const w = clampWeight(b.weights[t]);
      if (!w) continue;
      const c = m > 0 && likeSet.has(`${b.id}:${t}`) ? 1 : 0;
      contrib[t].set(b.id, m * (1 + LIKE_BONUS * c) * w);
    }
  }

  const lift = {} as Record<TagId, number>;
  const scores = {} as Record<TagId, number>;
  for (const t of ALL_TAGS) {
    const sum = [...contrib[t].values()].reduce((a, v) => a + v, 0);
    const l = (Math.max(0, sum) / BASELINE_WEIGHT) * (REFERENCE_BOOKS / Math.max(1, multiplierTotal));
    lift[t] = l;
    scores[t] = Math.round(100 * (1 - Math.exp(-l / SATURATION_K)));
  }

  const rankBy = <T extends TagId>(tags: readonly T[]) =>
    [...tags].sort((a, b) => lift[b] - lift[a] || tags.indexOf(a) - tags.indexOf(b));
  const coreRank = rankBy(CORE_TAGS);
  const [main, sub] = coreRank;
  const aftertaste = rankBy(AFTERTASTE_TAGS)[0];
  const style = rankBy(STYLE_TAGS)[0];

  const margin = lift[main] > 0 ? (lift[main] - lift[sub]) / lift[main] : 0;
  const signals = input.books.length + (input.favorite ? 1 : 0) + input.likes.length;
  const confidence: Confidence = margin < 0.08 ? 'mixed' : margin >= 0.18 && signals >= 6 ? 'clear' : 'leaning';

  const majorityGenre = pickMajorityGenre(input.books, contrib[main]);
  const crossGenre = new Set(input.books.filter((b) => clampWeight(b.weights[main]) >= 2).map((b) => b.genre)).size >= 2;

  // 隠れた好み：上位2つ以外で得点が高く、得点の半分以上が多数派ジャンル以外の本から来ているもの
  const genreOf = new Map(input.books.map((b) => [b.id, b.genre]));
  let hidden: CoreTag | undefined;
  for (const t of coreRank.slice(2)) {
    if (scores[t] < 35) continue;
    const pos = [...contrib[t].entries()].filter(([, v]) => v > 0);
    const total = pos.reduce((a, [, v]) => a + v, 0);
    const outside = pos.filter(([id]) => genreOf.get(id) !== majorityGenre).reduce((a, [, v]) => a + v, 0);
    if (total > 0 && outside / total >= 0.5) {
      hidden = t;
      break;
    }
  }

  const positive = [...contrib[main].entries()].filter(([, v]) => v > 0);
  const total = positive.reduce((a, [, v]) => a + v, 0);
  const evidence = positive
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([bookId, v]) => ({ bookId, share: Math.round((100 * v) / total), liked: likeSet.has(`${bookId}:${main}`) }));

  return {
    scores,
    main,
    sub,
    aftertaste,
    style,
    typeName: TYPE_NAMES[main].name,
    secondTypeName: confidence === 'mixed' ? TYPE_NAMES[sub].name : undefined,
    modifier: AFTERTASTE_MODIFIERS[aftertaste],
    copy: TYPE_NAMES[main].copy,
    confidence,
    majorityGenre,
    crossGenre,
    hidden,
    evidence,
  };
}

function clampWeight(w: number | undefined): number {
  if (typeof w !== 'number' || !Number.isFinite(w)) return 0;
  return Math.max(0, Math.min(3, Math.round(w)));
}

function pickMajorityGenre(books: TaggedBook[], mainContrib: Map<string, number>): Genre {
  const count = new Map<Genre, number>();
  const weight = new Map<Genre, number>();
  for (const b of books) {
    count.set(b.genre, (count.get(b.genre) ?? 0) + 1);
    weight.set(b.genre, (weight.get(b.genre) ?? 0) + (mainContrib.get(b.id) ?? 0));
  }
  return [...count.keys()].sort(
    (a, b) => count.get(b)! - count.get(a)! || weight.get(b)! - weight.get(a)! || a.localeCompare(b),
  )[0];
}
