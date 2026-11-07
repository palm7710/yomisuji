// 開発用の模擬AI（DEEPSEEK_MOCK=1 のとき）。DeepSeek につながらない環境で画面を確かめるためのもの。
// 書名から決まる疑似乱数でタグを付けるので、結果に意味はない。毎回少し変わるのは本物と同じ。

import { AFTERTASTE_TAGS, CORE_TAGS, GENRES, STYLE_TAGS, TAGS } from '@/data/tags';
import { SHELF_BOOKS } from '@/data/books';
import type { AnalysisContext, BookForTagging } from './prompts';

function rand(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= Math.floor(Math.random() * 1000); // 毎回少し変わる
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 10000) / 10000;
  };
}

export function mockTagging(books: BookForTagging[]) {
  return {
    books: books.map((b) => {
      const r = rand(b.title);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
      const weights: Record<string, number> = {};
      weights[pick(CORE_TAGS)] = 3;
      weights[pick(CORE_TAGS)] = Math.max(weights[pick(CORE_TAGS)] ?? 0, 2);
      weights[pick(CORE_TAGS)] = weights[pick(CORE_TAGS)] ?? 1;
      weights[pick(AFTERTASTE_TAGS)] = 2;
      weights[pick(STYLE_TAGS)] = 2;
      return { id: b.id, genre: pick(GENRES.slice(0, 12)), weights, note: `（模擬）${b.title}の特徴メモ` };
    }),
  };
}

export function mockAnalysis(ctx: AnalysisContext) {
  const s = ctx.scoring;
  const selected = new Set(ctx.books.map((b) => b.title));
  const recs = SHELF_BOOKS.filter((b) => !selected.has(b.title)).sort(() => Math.random() - 0.5).slice(0, 6);
  return {
    summary: `（模擬）ジャンルは${s.majorityGenre}。でも惹かれているのは、${TAGS[s.main].essence}かもしれません。`,
    detail: `（模擬）${TAGS[s.sub].essence}にも惹かれていそうです。`,
    aftertaste: `（模擬）${TAGS[s.aftertaste].essence}が合いそうです。`,
    style: `（模擬）${TAGS[s.style].essence}が好きそうです。`,
    hidden: s.hidden ? `（模擬）実は${TAGS[s.hidden].essence}にも惹かれていそうです。` : null,
    evidence: s.evidence.map((e) => ({ book_id: e.bookId, reason: `（模擬）「${TAGS[s.main].label}」に効いた一冊です。` })),
    recommendations: recs.map((b, i) => ({ title: b.title, author: b.author, reason: '（模擬）重なる面白さがありそうな一冊です。', tags: [s.main], surprise: i === 2 })),
  };
}
