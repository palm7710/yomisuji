// DeepSeek への指示文と、返ってきたJSONの検査。
// 検査は純粋な関数にしてあり、テストで確かめられる。

import { AFTERTASTE_TAGS, ALL_TAGS, CORE_TAGS, GENRES, STYLE_TAGS, TAGS, type Genre, type TagId } from '@/data/tags';
import { isShelf, type Shelf } from '@/data/shelves';
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
export const analysisMaxTokens = (n: number) => 3800 + 70 * n;

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
  books: {
    id: string;
    title: string;
    author: string;
    genre: Genre;
    note: string;
    /** Google Books の内容紹介（短く切ったもの）。具体的に書くための手がかり */
    about?: string;
    likedTags: TagId[];
    likedLabels: string[];
    favorite: boolean;
  }[];
}

export interface AnalysisText {
  summary: string;
  detail: string;
  aftertaste: string;
  style: string;
  hidden?: string;
  evidence: { bookId: string; reason: string }[];
  recommendations: {
    title: string;
    author: string;
    reason: string;
    tags: TagId[];
    /** どの棚のおすすめか（src/data/shelves.ts） */
    shelf: Shelf;
    /** 読み味：読んでいるとき・読み終えたときの気持ち（AIの見立て） */
    feel?: string;
    /** この人が引っかかるかもしれないところ（AIの見立て） */
    caution?: string;
  }[];
  // ↓ 詳しい分析。どれもAIが書けなかったときは空のまま（画面ではその欄を出さない）
  /** 読み筋をひと言で（キャッチコピー） */
  catchphrase?: string;
  /** 本に求めているもの（ひと言。たとえを使ってよい） */
  coreNeed?: string;
  /** あなたへの読み解き：具体的な観察 → 奥にある欲求 → 本人も気づいていない一面、の短い手紙 */
  letter?: string;
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
  coreNeed: 40,
  letter: 340,
  patternTitle: 20,
  patternBody: 110,
  connection: 90,
  point: 70,
  mismatch: 90,
  howToChoose: 100,
  feel: 50,
  caution: 50,
};

/** 他人の感想を見てきたように読める言い回し（AIの見立てとしては出さない） */
const HEARSAY = /(読者|レビュー|評判|口コミ|クチコミ|話題の|多くの人|みんなが|と評され)/;

/** 断定・評価に聞こえて避けたい言い回し */
export const NG_WORDS = ['性格', '頭がいい', '頭が悪い', 'IQ', '異常', '天才', '凡人'];

export const ANALYSIS_SYSTEM = `あなたは、お客さんの本棚を見ただけで「この人が本に何を求めているか」を言い当てる、ベテランの書店員です。
渡された本と計算結果をもとに、診断結果の文章とおすすめの本を書きます。出力は必ずJSONだけにしてください。

目指すのは、読んだ人が「どうしてわかったの」と思う文章です。書く前に、頭の中で次の順に考えてください（考えた過程は出力しない）。
1. 観察：選ばれた本を並べて、具体的な共通点を探す。題材、主人公や書き手の立場（組織の中か外か、子どもか大人か、当事者か観察者か）、よく出てくる場面、語り口、読み終えたときの温度、そして「選ばれていないもの」。
2. 解釈：その共通点の奥にある、この人が本に求めているものを一つに絞る（例：「答えが出ないままでも、誰かが本気で考えた跡」「自分では行けない場所の、内側の空気」）。
3. 意外な一面：本人も気づいていなさそうな組み合わせのズレや矛盾を一つ見つける（例：「読後はスカッとしたいのに、選ぶのは苦い結末の本」「実用書を選ぶときも、手順より“なぜそうするのか”の説明に惹かれている」）。

書き方のルール：
- 具体的に書く。どの文にも、本の題名とその本の具体的な要素（場面の種類、人物の立場、構成、語り口など）を入れる。タグの名前やジャンル名を言い換えるだけの文は書かない（得点やタグ名は画面に別に出ている）。
- 誰にでも当てはまる文（例：「人の気持ちに敏感なようです」「新しい世界を知るのが好きなようです」）は書かない。この組み合わせの本棚でなければ書けないことを書く。
- 決まり文句を使わない：「魅力的」「奥深い」「心に響く」「惹かれる傾向」「楽しめそう」「〜な面白さ」「世界観」「刺激」。
- 観察したことは言い切る（「〜を選んでいます」「〜が並んでいます」）。推量の言い方（「〜のかもしれません」「〜のでは」）は、解釈を述べる文だけに使う。すべての文を推量にしない。
- 選ばれた本には、小説・マンガ・ライトノベル・エッセイ・ビジネス書・実用書・ノンフィクション・写真集などが混ざる。ジャンルがばらばらでも、無理に一つの言葉でまとめず、ばらばらであること自体から読み取れることを書いてよい。
- 小説寄りの専門用語（伏線、叙述トリック、群像劇、プロット、メタ構造など）は使わず、ふだんの言葉で言い換える。「物語」「登場人物」は小説やマンガについて書くときだけ使う。
- タグの名前を書くときは、渡した日本語の名前をそのまま使う（英語のidは書かない）。
- 読み方・本に求めているものについて書く。性格・能力・心の状態を決めつけない。「性格」「頭がいい」などの評価の言葉を使わない。
- ネタバレを書かない（結末、犯人、仕掛けの中身）。作品について書くのは、渡した note・about と、その本について一般によく知られている特徴の範囲だけ。知らない本は、渡した情報からわかることだけを書く。
- 本の題名を書くときは『』で囲む。渡していない本の題名は、おすすめ（recommendations）以外では書かない。
- 文字数の上限を守る：summary ${LIMITS.summary}字、detail ${LIMITS.detail}字、core_need ${LIMITS.coreNeed}字、letter ${LIMITS.letter}字、aftertaste と style ${LIMITS.aftertaste}字、hidden ${LIMITS.hidden}字、reason ${LIMITS.reason}字、catchphrase ${LIMITS.catchphrase}字、patterns の title ${LIMITS.patternTitle}字・body ${LIMITS.patternBody}字、connections の text ${LIMITS.connection}字、per_book の point ${LIMITS.point}字、mismatch ${LIMITS.mismatch}字、how_to_choose ${LIMITS.howToChoose}字。

各項目：
- core_need は、手順2で絞った「本に求めているもの」をひと言で。たとえを使ってよい。タグ名を使わない。
- letter は、この人に宛てた短い手紙。「あなたは」で語りかけ、4〜6文。①選んだ本のうち2冊以上を具体的に挙げた観察 → ②その奥にある本に求めているもの → ③本人も気づいていなさそうな意外な一面（手順3） → ④この人にとって本を読むことがどんな時間なのかを一文で、の順に書く。
- summary は、診断の要点を、本人がはっとする言い方で1〜2文。
- detail は、サブの面白さが、メインの面白さとどう組み合わさっているかを1〜2文。
- catchphrase は、その人の読み筋を言い表す短い二つ名（例：「静かな謎に耳をすます人」「人の本音を拾い集める人」）。ジャンル名を入れない。タイプ名をそのまま繰り返さない。
- patterns は、選び方・読み方のくせを2〜3個。title は行動として書く（例：「主人公が輪の外にいる本を選ぶ」「解説より先に図を見る」）。body は、どの本のどこからそう言えるかを入れる。
- connections は、ジャンルの違う本どうしに共通するものを1〜2個。book_ids に2冊のidを入れる。表面の共通点ではなく、読んでいるときの体験の共通点を書く。
- per_book は、選ばれた本すべてについて、この人がその本のどこを味わっていそうかを1文ずつ。その本ならではの要素を入れる。liked（好きなところ）があればそれを生かす。favorite の本は特に丁寧に。
- mismatch は、得点の低い面白さから、合わないかもしれない本の傾向をやわらかく1〜2文。特定の本や作家をけなさない。
- how_to_choose は、次の本を探すときの具体的なヒント（帯や紹介文で探す言葉、棚の歩き方、読み方）を1〜2文。

おすすめのルール：
- 実在する本だけを挙げる。題名と著者名は、日本で流通している表記で正確に書く。自信がない本は挙げない。
- 選ばれた本・同じシリーズの続編は挙げない。
- 10冊挙げ、それぞれ shelf（棚）を付ける。棚ごとの冊数は center 3冊、detour 3冊、stretch 2冊、surprise 2冊。同じ本を2つの棚に入れない。
  - center（ど真ん中）：メインの面白さがいちばん強い本。この人が迷わず楽しめる本。
  - detour（寄り道）：サブの面白さ、または隠れた好みが強い本。メインとは少し違う入口から楽しめる本。
  - stretch（ちょっと背伸び）：いちばん得点の低い面白さがはっきり入っているが、メインの面白さか好きな読後感も持っていて入りやすい本。reason は「〜は少し遠いかもしれないけれど、〜があるから入りやすい」のように、遠い面白さと入口の両方を書く。
  - surprise（意外な一冊）：選ばれた本のどのジャンルにも当てはまらないジャンルで、メインの面白さが通じる本。reason では、ジャンルが違っても通じる理由を書く。
- tags には、その本と利用者で重なるタグのidを1〜2個入れる。
- reason は、この人の読み筋のどこにその本が合いそうかを1文で。
- feel は、商品紹介ではわからない「読み味」を1文で（${LIMITS.feel}字まで）。読んでいる間や読み終えたあとにどんな気持ちになるか（例：「ページを閉じたあと、しばらく窓の外を眺めたくなる静けさ」）。あらすじやネタバレは書かない。
- caution は、この人の得点の低い面白さや好みから見て、引っかかるかもしれないところを1文で（${LIMITS.caution}字まで）。本をけなさず、「〜が気になるかも」とやわらかく書く。
- feel と caution は、あなた自身の見立てとして書く。「読者の多くが」「評判では」など、他の人の感想や評価を見たかのような書き方はしない。`;

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
    about: b.about || undefined,
    favorite: b.favorite,
    liked: b.likedLabels,
    liked_tags: b.likedTags.map((t) => TAGS[t].label),
  })),
)}

次の形のJSONで返してください。
{
 "core_need": "本に求めているものをひと言で",
 "letter": "この人への短い手紙（4〜6文）",
 "summary": "診断の要点1〜2文",
 "detail": "サブとメインの組み合わせ1〜2文",
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
 "recommendations": [{"title": "題名", "author": "著者", "reason": "合いそうなところ1文", "feel": "読み味1文", "caution": "引っかかるかもしれないところ1文", "tags": ["mechanism"], "shelf": "center"}]
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
    // 読み味・引っかかるかも は任意。だめならその項目だけ捨てる
    const optional = (v: unknown, limit: number): string | undefined => {
      try {
        const t = cleanText(v, limit);
        return HEARSAY.test(t) ? undefined : t;
      } catch {
        return undefined;
      }
    };
    recommendations.push({
      title,
      author,
      reason,
      tags,
      // 棚がない・おかしいときは、以前の「意外な一冊」の印を見て、それ以外はど真ん中に入れる
      shelf: isShelf(rec.shelf) ? rec.shelf : rec.surprise === true ? 'surprise' : 'center',
      feel: optional(rec.feel, LIMITS.feel),
      caution: optional(rec.caution, LIMITS.caution),
    });
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
  const coreNeed = soft(r.core_need, LIMITS.coreNeed);
  const letter = soft(r.letter, LIMITS.letter);
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
    coreNeed,
    letter,
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
