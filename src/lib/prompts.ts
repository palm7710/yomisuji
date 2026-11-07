// DeepSeek への指示文と、返ってきたJSONの検査。
// 検査は純粋な関数にしてあり、テストで確かめられる。

import { AFTERTASTE_TAGS, ALL_TAGS, CORE_TAGS, GENRES, STYLE_TAGS, TAGS, type Genre, type TagId } from '@/data/tags';
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
- 読後感（exhilarating, lingering, bitter, warm, unsettling）と書き方（ensemble, inner, dialogue, document, lecture）も、それぞれ1つ以上付ける。
- genre は次から1つ選ぶ：${GENRES.join('、')}
- note は40字以内。その本の特徴をネタバレなしで書く。結末・犯人・どんでん返しの中身は書かない。
- よく知らない本は、渡された分類と内容紹介だけから判断し、重みは控えめにする。作り話はしない。
- 小説やマンガ以外（エッセイ・ビジネス書・自己啓発・実用書・ノンフィクション・絵本）にも、同じタグで「どんな面白さの本か」を付ける。
  例：考え方が変わる自己啓発書は mechanism、仕事の現場を描くビジネス書は organization、旅行記は immersion、
  著者の本音がにじむエッセイは lies や inner、図解の多い入門書は lecture。`;

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
${JSON.stringify(list)}`;
}

export class InvalidAiOutputError extends Error {}

/** 返り値から、正しくタグが付いた本だけを取り出す（欠けた本は含まれない） */
export function parseTaggingPartial(raw: unknown, ids: string[]): Map<string, BookTagging> {
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
  return byId;
}

/** タグ付け1回分の出力の上限（本の数に合わせる） */
export const taggingMaxTokens = (n: number) => 150 + 120 * n;
/** 分析1回分の出力の上限（本の数に合わせる） */
export const analysisMaxTokens = (n: number) => 2000 + 60 * n;

export function validateTagging(raw: unknown, ids: string[]): BookTagging[] {
  const byId = parseTaggingPartial(raw, ids);
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
  // ↓ 詳しい分析。どれもAIが書けなかったときは空のまま（画面ではその欄を出さない）
  /** 読み筋をひと言で（キャッチコピー） */
  catchphrase?: string;
  /** 読み方のくせ（2〜3個） */
  patterns?: { title: string; body: string }[];
  /** 本と本のつながり（1〜2個） */
  connections?: { bookIds: string[]; text: string }[];
  /** 選んだ本それぞれで、惹かれていそうなところ */
  perBook?: { bookId: string; point: string }[];
  /** 合わないかもしれない本の傾向 */
  mismatch?: string;
  /** 次の本の選び方のヒント */
  howToChoose?: string;
}

export const LIMITS = {
  summary: 120,
  detail: 140,
  aftertaste: 70,
  style: 70,
  hidden: 90,
  reason: 70,
  catchphrase: 30,
  patternTitle: 20,
  patternBody: 90,
  connection: 90,
  point: 60,
  mismatch: 90,
  howToChoose: 100,
};

/** 断定・評価に聞こえて避けたい言い回し */
export const NG_WORDS = ['性格', '頭がいい', '頭が悪い', 'IQ', '異常', '天才', '凡人'];

export const ANALYSIS_SYSTEM = `あなたは読書傾向を言葉にする、やさしい書評家です。
渡された計算結果と本の情報だけをもとに、診断結果の文章とおすすめの本を書きます。出力は必ずJSONだけにしてください。

書き方のルール：
- 選ばれた本には、小説・マンガ・ライトノベル・エッセイ・ビジネス書・実用書・ノンフィクションなどが混ざる。どのジャンルを読む人が読んでも「自分のことだ」と思える言葉で書く。
- 小説寄りの専門用語（伏線、叙述トリック、群像劇、プロット、メタ構造など）は使わず、ふだんの言葉で言い換える。
- 「物語」「登場人物」は小説やマンガについて書くときだけ使う。本全体については「本」「書き手」「読み心地」などを使う。
- タグの名前は、渡した日本語の名前をそのまま使う（英語のidは書かない）。
- 結果は読書傾向の「仮説」として書く。文末は「〜かもしれません」「〜そうです」「〜が合いそうです」。
- 性格・能力・心の状態を決めつけない。「性格」「頭がいい」などの評価の言葉を使わない。
- 本の結末、犯人、仕掛けの中身などネタバレを書かない。作品について書くのは、渡した note と一般によく知られた特徴の範囲だけ。
- 本の題名を書くときは『』で囲む。渡していない本の題名は、おすすめ（recommendations）以外では書かない。
- 文字数の上限を守る：summary ${LIMITS.summary}字、detail ${LIMITS.detail}字、aftertaste と style ${LIMITS.aftertaste}字、hidden ${LIMITS.hidden}字、reason ${LIMITS.reason}字、catchphrase ${LIMITS.catchphrase}字、patterns の title ${LIMITS.patternTitle}字・body ${LIMITS.patternBody}字、connections の text ${LIMITS.connection}字、per_book の point ${LIMITS.point}字、mismatch ${LIMITS.mismatch}字、how_to_choose ${LIMITS.howToChoose}字。
- catchphrase は、その人の読み筋を言い表す短い二つ名（例：「静かな謎に耳をすます人」「人の本音を拾い集める人」）。ジャンル名を入れない。タイプ名をそのまま繰り返さない。
- patterns は、選んだ本や「好きなところ」から見える読み方のくせを2〜3個。抽象的な言葉だけで終わらせず、本の具体的な特徴に結びつける。
- connections は、ジャンルの違う本どうしに共通する面白さを1〜2個。book_ids に2冊のidを入れる。
- per_book は、選ばれた本すべてについて、この人が惹かれていそうなところを1文ずつ。liked（好きなところ）があればそれを生かす。
- mismatch は、得点の低い面白さから、合わないかもしれない本の傾向をやわらかく1〜2文。特定の本や作家をけなさない。
- how_to_choose は、次の本を探すときの具体的なヒント（キーワード、読み方、棚の歩き方など）を1〜2文。

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
- 好きな読後感：${TAGS[s.aftertaste].label}　好きな書き方：${TAGS[s.style].label}
- 選んだ本でいちばん多いジャンル：${s.majorityGenre}　メインの面白さがジャンルをまたいでいるか：${s.crossGenre ? 'はい' : 'いいえ'}
- 隠れた好み：${s.hidden ? TAGS[s.hidden].label : 'なし'}
- 好みの集中度：${s.focus}（${s.focusType}）　いちばん得点の低い面白さ：${TAGS[s.contrast].label}
- 読後感の得点：${JSON.stringify(Object.fromEntries(AFTERTASTE_TAGS.map((t) => [TAGS[t].label, s.scores[t]])))}
- 書き方の得点：${JSON.stringify(Object.fromEntries(STYLE_TAGS.map((t) => [TAGS[t].label, s.scores[t]])))}
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
)}

次の形のJSONで返してください。
{
 "summary": "「ジャンルは${s.majorityGenre}。でも惹かれているのは…かもしれません。」の形の1〜2文",
 "detail": "サブの面白さや、選んだ本どうしのつながりを1〜2文",
 "aftertaste": "好きな読後感について1文",
 "style": "好きな書き方について1文",
 "hidden": ${s.hidden ? '"隠れた好みについて1文"' : 'null'},
 "evidence": [{"book_id": "メインの得点に効いた本のid", "reason": "その本がメインの面白さにどう効いたか1文"}],
 "catchphrase": "読み筋をひと言で",
 "patterns": [{"title": "くせの名前", "body": "具体的な説明1〜2文"}],
 "connections": [{"book_ids": ["id1", "id2"], "text": "2冊に共通する面白さ1文"}],
 "per_book": [{"book_id": "選ばれた本のid", "point": "惹かれていそうなところ1文"}],
 "mismatch": "合わないかもしれない本の傾向",
 "how_to_choose": "次の本の選び方のヒント",
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

  // 詳しい分析：1項目ずつ検査し、だめな項目だけ捨てる（全体はやり直さない）
  const soft = (v: unknown, limit: number): string | undefined => {
    try {
      const t = cleanText(v, limit);
      checkTitles(t, selectedTitles);
      return t;
    } catch {
      return undefined;
    }
  };
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const ids = new Set(ctx.books.map((b) => b.id));

  const catchphrase = soft(r.catchphrase, LIMITS.catchphrase);
  const patterns = arr(r.patterns)
    .map((p) => ({ title: soft(p?.title, LIMITS.patternTitle), body: soft(p?.body, LIMITS.patternBody) }))
    .filter((p): p is { title: string; body: string } => !!p.title && !!p.body)
    .slice(0, 3);
  const connections = arr(r.connections)
    .map((c) => {
      const bookIds = (Array.isArray(c?.book_ids) ? c.book_ids : []).map(String).filter((id) => ids.has(id));
      return { bookIds: [...new Set(bookIds)].slice(0, 2), text: soft(c?.text, LIMITS.connection) };
    })
    .filter((c): c is { bookIds: string[]; text: string } => c.bookIds.length === 2 && !!c.text)
    .slice(0, 2);
  const perBook: { bookId: string; point: string }[] = [];
  for (const pb of arr(r.per_book)) {
    const bookId = String(pb?.book_id ?? '');
    const point = soft(pb?.point, LIMITS.point);
    if (ids.has(bookId) && point && !perBook.some((x) => x.bookId === bookId)) perBook.push({ bookId, point });
  }
  const mismatch = soft(r.mismatch, LIMITS.mismatch);
  const howToChoose = soft(r.how_to_choose, LIMITS.howToChoose);

  return {
    summary,
    detail,
    aftertaste,
    style,
    hidden,
    evidence,
    recommendations,
    catchphrase,
    patterns,
    connections,
    perBook,
    mismatch,
    howToChoose,
  };
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
