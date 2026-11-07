// 診断の全体の流れ。
// 1. 選ばれた本の書誌を Google Books から取る
// 2. DeepSeek に本ごとのタグを付けてもらう（1回目）
// 3. タグから得点・タイプを計算する
// 4. DeepSeek に分析の文章とおすすめを書いてもらう（2回目）。検査に落ちたら定型文
// 5. おすすめの本が Google Books に実在するか確かめ、実在した3冊だけ残す
// 6. 結果を保存し、IDを返す

import 'server-only';
import type { TagId } from '@/data/tags';
import { LIKE_BY_ID } from '@/data/likes';
import { aiModelName, chatJson, isMock } from './deepseek';
import { findBook, getVolume, toPublic, type BookMeta } from './googleBooks';
import { mockAnalysis, mockTagging } from './mock';
import {
  ANALYSIS_SYSTEM,
  TAGGING_SYSTEM,
  analysisUserPrompt,
  fallbackText,
  taggingUserPrompt,
  validateAnalysis,
  validateTagging,
  type AnalysisContext,
  type AnalysisText,
  type BookTagging,
} from './prompts';
import { MAX_BOOKS, MAX_DISLIKED, MIN_BOOKS, score } from './scoring';
import { newResultId, saveResult } from './store';
import type { DiagnoseRequest, DiagnosisResult } from './types';

export class BadRequestError extends Error {}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const VOLUME_ID = /^[A-Za-z0-9_-]{4,40}$/;

/** `本ID:選択肢ID` を、計算用の `本ID:タグ` に置き換える */
export function expandLikes(likes: string[]): string[] {
  return uniq(
    likes.flatMap((k) => {
      const [id, opt] = k.split(':');
      return (LIKE_BY_ID[opt]?.tags ?? []).map((t) => `${id}:${t}`);
    }),
  );
}

export function normalizeRequest(req: DiagnoseRequest): Required<DiagnoseRequest> {
  const books = uniq((req.books ?? []).filter((id) => typeof id === 'string' && VOLUME_ID.test(id)));
  if (books.length < MIN_BOOKS) throw new BadRequestError(`本は${MIN_BOOKS}冊以上選んでください`);
  if (books.length > MAX_BOOKS) throw new BadRequestError(`本は${MAX_BOOKS}冊までです`);
  const favorite = req.favorite && books.includes(req.favorite) ? req.favorite : '';
  const likes = uniq(
    (req.likes ?? []).filter((k) => {
      const [id, opt] = String(k).split(':');
      return books.includes(id) && opt in LIKE_BY_ID;
    }),
  );
  const disliked = uniq((req.disliked ?? []).filter((id) => VOLUME_ID.test(id) && !books.includes(id))).slice(0, MAX_DISLIKED);
  return { books, favorite, likes, disliked };
}

async function tag(books: BookMeta[]): Promise<BookTagging[]> {
  const ids = books.map((b) => b.volumeId);
  const input = books.map((b) => ({ id: b.volumeId, title: b.title, authors: b.authors, categories: b.categories, description: b.description }));
  if (isMock()) return validateTagging(mockTagging(input), ids);
  // タグが欠けた本があれば1回だけやり直す
  try {
    return validateTagging(await chatJson(TAGGING_SYSTEM, taggingUserPrompt(input), { temperature: 0.4 }), ids);
  } catch (e) {
    console.warn(`[analyze] tagging retry: ${(e as Error).message}`);
    return validateTagging(await chatJson(TAGGING_SYSTEM, taggingUserPrompt(input), { temperature: 0.2 }), ids);
  }
}

async function write(ctx: AnalysisContext): Promise<{ text: AnalysisText; fallback: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = isMock() ? mockAnalysis(ctx) : await chatJson(ANALYSIS_SYSTEM, analysisUserPrompt(ctx), { temperature: 0.8, maxTokens: 6000 });
      return { text: validateAnalysis(raw, ctx), fallback: false };
    } catch (e) {
      console.warn(`[analyze] analysis attempt ${attempt + 1} rejected: ${(e as Error).message}`);
    }
  }
  return { text: fallbackText(ctx), fallback: true };
}

/** AIが挙げたおすすめを Google Books で確かめ、実在して選ばれていない本を最大3冊返す */
async function verifyRecommendations(recs: AnalysisText['recommendations'], selectedIds: string[]) {
  const found = await Promise.all(recs.slice(0, 8).map((r) => findBook({ title: r.title, author: r.author })));
  const out: DiagnosisResult['recommendations'] = [];
  const used = new Set(selectedIds);
  recs.slice(0, 8).forEach((r, i) => {
    const m = found[i];
    if (!m || used.has(m.volumeId) || out.length >= 3) return;
    used.add(m.volumeId);
    out.push({ book: toPublic(m), reason: r.reason, tags: r.tags, surprise: r.surprise });
  });
  // 「意外な一冊」は1冊だけに
  let seen = false;
  for (const r of out) {
    if (r.surprise && !seen) seen = true;
    else r.surprise = false;
  }
  return out;
}

export async function runDiagnosis(raw: DiagnoseRequest): Promise<DiagnosisResult> {
  const req = normalizeRequest(raw);

  // 1. 書誌
  const metas = await Promise.all([...req.books, ...req.disliked].map(getVolume));
  const books = metas.slice(0, req.books.length);
  const missing = req.books.filter((_, i) => !books[i]);
  if (missing.length > 0) throw new BadRequestError('本の情報を取得できませんでした。少し時間をおいてもう一度お試しください');
  const dislikedMetas = metas.slice(req.books.length).filter((m): m is BookMeta => !!m);
  const all = [...(books as BookMeta[]), ...dislikedMetas];

  // 2. タグ付け
  const tagging = await tag(all);
  const tagOf = new Map(tagging.map((t) => [t.id, t]));

  // 3. 計算
  const tagged = (m: BookMeta) => ({ id: m.volumeId, title: m.title, genre: tagOf.get(m.volumeId)!.genre, weights: tagOf.get(m.volumeId)!.weights });
  const scoring = score({
    books: (books as BookMeta[]).map(tagged),
    disliked: dislikedMetas.map(tagged),
    favorite: req.favorite || undefined,
    likes: expandLikes(req.likes),
  });

  // 4. 文章
  const ctx: AnalysisContext = {
    scoring,
    books: (books as BookMeta[]).map((m) => ({
      id: m.volumeId,
      title: m.title,
      author: m.authors.join('、'),
      genre: tagOf.get(m.volumeId)!.genre,
      note: tagOf.get(m.volumeId)!.note,
      favorite: m.volumeId === req.favorite,
      likedTags: expandLikes(req.likes)
        .filter((k) => k.startsWith(`${m.volumeId}:`))
        .map((k) => k.split(':')[1] as TagId),
      likedLabels: req.likes.filter((k) => k.startsWith(`${m.volumeId}:`)).map((k) => LIKE_BY_ID[k.split(':')[1]].label),
    })),
  };
  const { text, fallback } = await write(ctx);

  // 5. おすすめの実在確認
  const recommendations = await verifyRecommendations(text.recommendations, [...req.books, ...req.disliked]);

  const result: DiagnosisResult = {
    id: newResultId(),
    createdAt: new Date().toISOString(),
    model: aiModelName(),
    fallbackText: fallback,
    books: (books as BookMeta[]).map((m) => ({
      ...toPublic(m),
      genre: tagOf.get(m.volumeId)!.genre,
      weights: tagOf.get(m.volumeId)!.weights,
      note: tagOf.get(m.volumeId)!.note,
    })),
    favorite: req.favorite || undefined,
    likes: req.likes,
    disliked: req.disliked,
    scoring,
    text: (({ recommendations: _r, ...rest }) => rest)(text),
    recommendations,
  };

  await saveResult(result);
  return result;
}

