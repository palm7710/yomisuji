// DeepSeek への指示文と、返ってきたJSONの検査。
// 検査は純粋な関数にしてあり、テストで確かめられる。

import { ALL_TAGS, CORE_TAGS, GENRES, TAGS, type Genre, type TagId } from '@/data/tags';
import type { ScoringResult } from './scoring';

// ---------------------------------------------------------------------------
// 1回目：選ばれた本にタグを付ける
// ---------------------------------------------------------------------------

export interface BookForTagging {
  id: string;
  title: string;
  authors: string[];
  categories?: string[];
  description?: string;
}

export interface BookTagging {
  id: string;
  genre: Genre;
  weights: Partial<Record<TagId, number>>;
  /** ネタバレなしの短い作品メモ。2回目の文章を書くときの根拠に使う */
  note: string;
}

const TAG_GUIDE = ALL_TAGS.map((t) => `- ${t}：${TAGS[t].label}（${TAGS[t].essence}）`).join('\n');

export const TAGGING_SYSTEM = `あなたは幅広いジャンルの本に詳しい書評家です。
本ごとに、物語や内容の「構造」を表すタグの重みを付けます。出力は必ずJSONだけにしてください。

タグ（3層18種）：
${TAG_GUIDE}

ルール：
- 重みは 0〜3 の整数。その本の面白さの中心なら3、はっきりあるなら2、少しあるなら1、なければ0（省略してよい）。
- 面白さの核（${CORE_TAGS.join(', ')}）から最低1つは2以上を付ける。
- 読後感（exhilarating, lingering, bitter, warm, unsettling）と語り方（ensemble, inner, dialogue, document, lecture）も、それぞれ1つ以上付ける。
- genre は次から1つ選ぶ：${GENRES.join('、')}
- note は40字以内。その本の特徴をネタバレなしで書く。結末・犯人・どんでん返しの中身は書かない。
- よく知らない本は、渡された分類と内容紹介だけから判断し、重みは控えめにする。作り話はしない。`;

export function taggingUserPrompt(books: BookForTagging[]): string {
  const list = books.map((b) => ({
    id: b.id,
    title: b.title,
    authors: b.authors,
    categories: b.categories ?? [],
    description: b.description?.slice(0, 400) ?? '',
  }));
  return `次の本それぞれにタグを付け、次の形のJSONで返してください。
{"books":[{"id":"渡したid","genre":"ミステリー","weights":{"reversal":3,"lies":2,"bitter":2,"ensemble":2},"note":"…"}]}

本：
${JSON.stringify(list, null, 1)}`;
}

export class InvalidAiOutputError extends Error {}

export function validateTagging(raw: unknown, ids: string[]): BookTagging[] {
  const books = (raw as { books?: unknown })?.books;
  if (!Array.isArray(books)) throw new InvalidAiOutputError('books がありません');
  const byId = new Map<string, BookTagging>();
  for (const item of books as Record<string, unknown>[]) {
    const id = String(item?.id ?? '');
    if (!ids.includes(id) || byId.has(id)) continue;
    const genre = (GENRES as readonly string[]).includes(String(item.genre)) ? (item.genre as Genre) : 'その他';
    const weights: Partial<Record<TagId, number>> = {};
    const w = (item.weights ?? {}) as Record<string, unknown>;
    for (const t of ALL_TAGS) {
      const v = Number(w[t]);
      if (Number.isFinite(v) && v > 0) weights[t] = Math.min(3, Math.round(v));
    }
    if (!CORE_TAGS.some((t) => (weights[t] ?? 0) > 0)) continue; // 面白さの核がない付け方は使わない
    const note = String(item.note ?? '').replace(/\s+/g, ' ').slice(0, 60);
    byId.set(id, { id, genre, weights, note });
  }
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new InvalidAiOutputError(`タグが付かなかった本があります: ${missing.join(', ')}`);
  return ids.map((id) => byId.get(id)!);
}

// ---------------------------------------------------------------------------
// 2回目：分析の文章とおすすめを書く
// ---------------------------------------------------------------------------

export interface AnalysisContext {
  scoring: ScoringResult;
  books: { id: string; title: string; author: string; genre: Genre; note: string; likedTags: TagId[]; likedLabels: string[]; favorite: boolean }[];
}

export interface AnalysisText {
  summary: string;
  detail: string;
  aftertaste: string;
  style: string;
  hidden?: string;
  evidence: { bookId: string; reason: string }[];
  recommendations: { title: string; author: string; reason: string; tags: TagId[]; surprise: boolean }[];
}

export const LIMITS = { summary: 120, detail: 140, aftertaste: 70, style: 70, hidden: 90, reason: 70 };

/** 断定・評価に聞こえて避けたい言い回し */
export const NG_WORDS = ['性格', '頭がいい', '頭が悪い', 'IQ', '異常', '天才', '凡人'];

export const ANALYSIS_SYSTEM = `あなたは読書傾向を言葉にする、やさしい書評家です。
渡された計算結果と本の情報だけをもとに、診断結果の文章とおすすめの本を書きます。出力は必ずJSONだけにしてください。

書き方のルール：
- 結果は読書傾向の「仮説」として書く。文末は「〜かもしれません」「〜そうです」「〜が合いそうです」。
- 性格・能力・心の状態を決めつけない。「性格」「頭がいい」などの評価の言葉を使わない。
- 本の結末、犯人、仕掛けの中身などネタバレを書かない。作品について書くのは、渡した note と一般によく知られた特徴の範囲だけ。
- 本の題名を書くときは『』で囲む。渡していない本の題名は、おすすめ（recommendations）以外では書かない。
- 文字数の上限を守る：summary ${LIMITS.summary}字、detail ${LIMITS.detail}字、aftertaste と style ${LIMITS.aftertaste}字、hidden ${LIMITS.hidden}字、reason ${LIMITS.reason}字。

おすすめのルール：
- 実在する本だけを挙げる。題名と著者名は、日本で流通している表記で正確に書く。自信がない本は挙げない。
- 選ばれた本・同じシリーズの続編は挙げない。
- 6冊挙げる。そのうち1冊だけ、選ばれた本にないジャンルから「意外な一冊」として surprise を true にする。
- tags には、その本と利用者で重なるタグのidを1〜2個入れる。`;

export function analysisUserPrompt(ctx: AnalysisContext): string {
  const s = ctx.scoring;
  const coreScores = Object.fromEntries(CORE_TAGS.map((t) => [`${t}（${TAGS[t].label}）`, s.scores[t]]));
  return `計算結果：
- タイプ：${s.modifier}${s.typeName}（メイン：${TAGS[s.main].label}、サブ：${TAGS[s.sub].label}、確からしさ：${s.confidence}）
- 面白さの核の得点（0〜100）：${JSON.stringify(coreScores)}
- 好きな読後感：${TAGS[s.aftertaste].label}　好きな語り方：${TAGS[s.style].label}
- 選んだ本でいちばん多いジャンル：${s.majorityGenre}　メインの面白さがジャンルをまたいでいるか：${s.crossGenre ? 'はい' : 'いいえ'}
- 隠れた好み：${s.hidden ? TAGS[s.hidden].label : 'なし'}
- メインの得点に効いた本（id）：${s.evidence.map((e) => e.bookId).join(', ')}

選ばれた本：
${JSON.stringify(
  ctx.books.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    genre: b.genre,
    note: b.note,
    favorite: b.favorite,
    liked: b.likedLabels,
    liked_tags: b.likedTags.map((t) => TAGS[t].label),
  })),
  null,
  1,
)}

次の形のJSONで返してください。
{
 "summary": "「ジャンルは${s.majorityGenre}。でも惹かれているのは…かもしれません。」の形の1〜2文",
 "detail": "サブの面白さや、選んだ本どうしのつながりを1〜2文",
 "aftertaste": "好きな読後感について1文",
 "style": "好きな語り方について1文",
 "hidden": ${s.hidden ? '"隠れた好みについて1文"' : 'null'},
 "evidence": [{"book_id": "メインの得点に効いた本のid", "reason": "その本がメインの面白さにどう効いたか1文"}],
 "recommendations": [{"title": "題名", "author": "著者", "reason": "すすめる理由1文", "tags": ["mechanism"], "surprise": false}]
}`;
}

function cleanText(v: unknown, limit: number): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (!s) throw new InvalidAiOutputError('空の文があります');
  if (s.length > limit * 1.5) throw new InvalidAiOutputError(`文が長すぎます（${s.length}字）`);
  if (NG_WORDS.some((w) => s.includes(w))) throw new InvalidAiOutputError(`避けたい言葉が含まれています: ${s}`);
  return s.length > limit ? s.slice(0, limit - 1) + '…' : s;
}

/** 『』で囲まれた題名が、許可した題名のどれかに当たるか */
function checkTitles(text: string, allowed: string[]): void {
  const norm = (x: string) => x.normalize('NFKC').replace(/\s/g, '');
  const ok = allowed.map(norm);
  for (const m of text.matchAll(/『([^』]+)』/g)) {
    const t = norm(m[1]);
    if (!ok.some((a) => a.includes(t) || t.includes(a))) {
      throw new InvalidAiOutputError(`選ばれていない本の題名が出てきました: ${m[1]}`);
    }
  }
}

export function validateAnalysis(raw: unknown, ctx: AnalysisContext): AnalysisText {
  const r = (raw ?? {}) as Record<string, unknown>;
  const selectedTitles = ctx.books.map((b) => b.title);

  const summary = cleanText(r.summary, LIMITS.summary);
  const detail = cleanText(r.detail, LIMITS.detail);
  const aftertaste = cleanText(r.aftertaste, LIMITS.aftertaste);
  const style = cleanText(r.style, LIMITS.style);
  const hidden = ctx.scoring.hidden && r.hidden ? cleanText(r.hidden, LIMITS.hidden) : undefined;
  for (const t of [summary, detail, aftertaste, style, hidden ?? '']) checkTitles(t, selectedTitles);

  const evidenceIds = new Set(ctx.scoring.evidence.map((e) => e.bookId));
  const evidence: AnalysisText['evidence'] = [];
  for (const e of Array.isArray(r.evidence) ? (r.evidence as Record<string, unknown>[]) : []) {
    const bookId = String(e?.book_id ?? '');
    if (!evidenceIds.has(bookId) || evidence.some((x) => x.bookId === bookId)) continue;
    const reason = cleanText(e.reason, LIMITS.reason);
    checkTitles(reason, selectedTitles);
    evidence.push({ bookId, reason });
  }

  const selectedNorm = selectedTitles.map((t) => t.normalize('NFKC').replace(/\s/g, ''));
  const recommendations: AnalysisText['recommendations'] = [];
  for (const rec of Array.isArray(r.recommendations) ? (r.recommendations as Record<string, unknown>[]) : []) {
    const title = String(rec?.title ?? '').replace(/[『』]/g, '').trim();
    const author = String(rec?.author ?? '').trim();
    if (!title || title.length > 60) continue;
    const tn = title.normalize('NFKC').replace(/\s/g, '');
    if (selectedNorm.some((s) => s.includes(tn) || tn.includes(s))) continue;
    let reason: string;
    try {
      reason = cleanText(rec.reason, LIMITS.reason);
    } catch {
      continue;
    }
    const tags = (Array.isArray(rec.tags) ? rec.tags : []).filter((t): t is TagId => (ALL_TAGS as readonly unknown[]).includes(t)).slice(0, 2);
    recommendations.push({ title, author, reason, tags, surprise: rec.surprise === true });
  }

  return { summary, detail, aftertaste, style, hidden, evidence, recommendations };
}

/** 2回目が検査に通らなかったときの、人が書いた定型文 */
export function fallbackText(ctx: AnalysisContext): AnalysisText {
  const s = ctx.scoring;
  const sub = ctx.books.find((b) => b.likedTags.includes(s.sub)) ?? ctx.books[0];
  return {
    summary: `ジャンルは${s.majorityGenre}。でも惹かれているのは、${s.crossGenre ? 'ジャンルをまたいで' : ''}${TAGS[s.main].essence}かもしれません。`,
    detail: `『${sub.title}』などからは、${TAGS[s.sub].essence}にも惹かれていることがうかがえます。`,
    aftertaste: `${TAGS[s.aftertaste].essence}が合いそうです。`,
    style: `${TAGS[s.style].essence}が好きそうです。`,
    hidden: s.hidden ? `選んだ本のジャンルからは意外ですが、${TAGS[s.hidden].essence}にも惹かれていそうです。` : undefined,
    evidence: s.evidence.map((e) => ({ bookId: e.bookId, reason: `「${TAGS[s.main].label}」の得点に効いた一冊です。` })),
    recommendations: [],
  };
}
