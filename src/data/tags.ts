// 物語構造タグ（3層・18種）。名前と説明文はすべて人が書いて調整する前提。

export type Layer = 'core' | 'aftertaste' | 'style';

export const CORE_TAGS = [
  'mechanism',
  'gamesmanship',
  'reversal',
  'lies',
  'outsider',
  'organization',
  'loss',
  'immersion',
] as const;
export const AFTERTASTE_TAGS = ['exhilarating', 'lingering', 'bitter', 'warm', 'unsettling'] as const;
export const STYLE_TAGS = ['ensemble', 'inner', 'dialogue', 'document', 'lecture'] as const;

export type CoreTag = (typeof CORE_TAGS)[number];
export type AftertasteTag = (typeof AFTERTASTE_TAGS)[number];
export type StyleTag = (typeof STYLE_TAGS)[number];
export type TagId = CoreTag | AftertasteTag | StyleTag;

export const ALL_TAGS: readonly TagId[] = [...CORE_TAGS, ...AFTERTASTE_TAGS, ...STYLE_TAGS];

export interface TagInfo {
  id: TagId;
  layer: Layer;
  /** 画面に出す短い名前 */
  label: string;
  /** 「でも惹かれているのは◯◯かもしれません」に入る言い回し */
  essence: string;
}

// 名前と言い回しは、小説・マンガ・エッセイ・ビジネス書・実用書のどれを読む人にも通じる、ふだんの言葉にしている。
// 「物語」「伏線」「群像劇」のような小説寄りの言葉は使わない。
export const TAGS: Record<TagId, TagInfo> = {
  mechanism: { id: 'mechanism', layer: 'core', label: '仕組みを知る', essence: '“仕組みがわかって、世界の見え方が変わる瞬間”' },
  gamesmanship: { id: 'gamesmanship', layer: 'core', label: '駆け引き', essence: '“相手の一手を読み合う緊張”' },
  reversal: { id: 'reversal', layer: 'core', label: '意外な展開', essence: '“最後に見え方がひっくり返る驚き”' },
  lies: { id: 'lies', layer: 'core', label: '人の本音', essence: '“人が隠している本音や弱さ”' },
  outsider: { id: 'outsider', layer: 'core', label: '輪の外の視点', essence: '“みんなの輪の外から見た景色”' },
  organization: { id: 'organization', layer: 'core', label: '仕事・組織のリアル', essence: '“仕事や組織の内側で動いている力”' },
  loss: { id: 'loss', layer: 'core', label: '立ち直る姿', essence: '“失ったあとに、また歩き出す姿”' },
  immersion: { id: 'immersion', layer: 'core', label: '別世界への没入', essence: '“知らない世界にどっぷり浸る感覚”' },

  exhilarating: { id: 'exhilarating', layer: 'aftertaste', label: '爽快感', essence: 'スカッと気持ちが晴れる読後感' },
  lingering: { id: 'lingering', layer: 'aftertaste', label: '余韻', essence: '読み終えてもしばらく心に残る余韻' },
  bitter: { id: 'bitter', layer: 'aftertaste', label: 'ほろ苦さ', essence: 'すっきりしない、ほろ苦い後味' },
  warm: { id: 'warm', layer: 'aftertaste', label: 'あたたかさ', essence: '人のつながりにほっとするあたたかさ' },
  unsettling: { id: 'unsettling', layer: 'aftertaste', label: 'ざわつき', essence: '心がざわっとする落ち着かなさ' },

  ensemble: { id: 'ensemble', layer: 'style', label: '大勢の視点', essence: 'たくさんの人の視点が重なっていく書き方' },
  inner: { id: 'inner', layer: 'style', label: '心の声', essence: '書き手や主人公の心の声に入り込める書き方' },
  dialogue: { id: 'dialogue', layer: 'style', label: '会話・掛け合い', essence: 'テンポのいい会話や掛け合いで進む書き方' },
  document: { id: 'document', layer: 'style', label: 'リアルな記録', essence: '取材や記録を積み重ねたリアルな書き方' },
  lecture: { id: 'lecture', layer: 'style', label: 'わかりやすい解説', essence: '読むほど理解が深まる、わかりやすい解説' },
};

/** メインタイプ（面白さの核）ごとのタイプ名と一言コピー。どのジャンルの読み手にも当てはまる言い方にする */
export const TYPE_NAMES: Record<CoreTag, { name: string; copy: string }> = {
  mechanism: { name: '仕組みを解き明かす人', copy: '「わかった」の瞬間に、世界の見え方が変わる。' },
  gamesmanship: { name: '駆け引きに燃える人', copy: '一手先を読み合う緊張が、いちばん楽しい。' },
  reversal: { name: 'どんでん返しを待つ人', copy: '「そういうことか」と声が出る瞬間を探している。' },
  lies: { name: '人の本音をのぞく人', copy: '人が隠している本音に、つい目が向いてしまう。' },
  outsider: { name: '輪の外に寄り添う人', copy: '輪の外にいる人の目で、世界を見てみたい。' },
  organization: { name: '組織の裏側を読む人', copy: '仕事や組織の「本当の動き方」が気になる。' },
  loss: { name: '立ち直る姿に惹かれる人', copy: '失ったあとに、もう一度歩き出す姿を見届けたい。' },
  immersion: { name: '別世界に飛び込む人', copy: '知らない世界へ、ページごと連れていってほしい。' },
};

/** AIが本に付けるジャンル（この中から選ばせる） */
export const GENRES = [
  'SF',
  'ファンタジー',
  'ミステリー',
  'ホラー',
  '恋愛',
  '文芸',
  '歴史・時代',
  'ライトノベル',
  'マンガ',
  '児童書',
  'エッセイ',
  'ノンフィクション',
  'ビジネス',
  '自己啓発',
  '科学・数学',
  '人文・思想',
  'その他',
] as const;
export type Genre = (typeof GENRES)[number];

/** 読後感（B層）の1位からつく修飾語 */
export const AFTERTASTE_MODIFIERS: Record<AftertasteTag, string> = {
  exhilarating: 'スカッと晴れやかに、',
  lingering: '余韻にひたりながら、',
  bitter: 'ほろ苦さも味わいながら、',
  warm: 'あたたかさを求めて、',
  unsettling: 'ざわつきも楽しみながら、',
};
