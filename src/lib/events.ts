// アクセス解析で数える操作の一覧。ここにない名前は数えない（送られてきても無視する）。
// 数えるのは「日ごとの回数」だけ。検索語・本・IPアドレスなど、人や中身がわかる情報は記録しない。
// ページの閲覧数・流入元・端末は Cloudflare Web Analytics で見る（layout.tsx）

export const EVENTS = {
  // 診断の流れ
  pick_start: { label: '本を選び始めた', group: '診断の流れ', client: true },
  diagnose_submit: { label: '診断ボタンを押した', group: '診断の流れ', client: true },
  diagnose_done: { label: '診断が完了した', group: '診断の流れ', client: false },
  diagnose_error: { label: '診断に失敗した', group: '診断の流れ', client: false },
  'books_5-7': { label: '診断した冊数：5〜7冊', group: '診断の流れ', client: false },
  'books_8-10': { label: '診断した冊数：8〜10冊', group: '診断の流れ', client: false },
  'books_11-15': { label: '診断した冊数：11〜15冊', group: '診断の流れ', client: false },
  result_view: { label: '結果ページが開かれた（シェア先からの訪問も含む）', group: '診断の流れ', client: true },
  // シェア
  share_x: { label: 'Xに投稿を押した', group: 'シェア', client: true },
  share_copy: { label: 'リンクをコピーした', group: 'シェア', client: true },
  // 次に読むなら
  rec_center: { label: '「ど真ん中」の本のリンクを押した', group: '次に読むなら', client: true },
  rec_detour: { label: '「寄り道」の本のリンクを押した', group: '次に読むなら', client: true },
  rec_stretch: { label: '「ちょっと背伸び」の本のリンクを押した', group: '次に読むなら', client: true },
  rec_surprise: { label: '「意外な一冊」の本のリンクを押した', group: '次に読むなら', client: true },
  rec_library: { label: '図書館で探す', group: '次に読むなら', client: true },
  rec_review: { label: '感想サイト（読書メーター・ブクログ・Amazon）', group: '次に読むなら', client: true },
  rec_google: { label: 'Google Books', group: '次に読むなら', client: true },
  rec_rediagnose: { label: '読んだら診断し直す', group: '次に読むなら', client: true },
  // 検索
  search: { label: '検索した', group: '検索', client: true },
  search_zero: { label: '検索結果が0件だった', group: '検索', client: true },
} as const;

export type EventName = keyof typeof EVENTS;

export const isEventName = (v: unknown): v is EventName => typeof v === 'string' && Object.prototype.hasOwnProperty.call(EVENTS, v);

/** 診断した冊数を、数えるときの区分にする */
export function bookCountEvent(n: number): EventName {
  return n <= 7 ? 'books_5-7' : n <= 10 ? 'books_8-10' : 'books_11-15';
}

/** 日付の区切り（日本時間） */
export function dayKey(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
