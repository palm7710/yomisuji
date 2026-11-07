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

export const TAGS: Record<TagId, TagInfo> = {
  mechanism: { id: 'mechanism', layer: 'core', label: '仕組みを解く', essence: '“世界の仕組みが見える瞬間”' },
  gamesmanship: { id: 'gamesmanship', layer: 'core', label: '駆け引き', essence: '“相手の手を読み合う緊張”' },
  reversal: { id: 'reversal', layer: 'core', label: '反転', essence: '“最後に意味がひっくり返る構成”' },
  lies: { id: 'lies', layer: 'core', label: '嘘と弱さ', essence: '“人が隠しているもの”' },
  outsider: { id: 'outsider', layer: 'core', label: 'はみ出し者', essence: '“社会の外側から見た景色”' },
  organization: { id: 'organization', layer: 'core', label: '組織の裏側', essence: '“組織や制度の内側で働く力”' },
  loss: { id: 'loss', layer: 'core', label: '喪失と再生', essence: '“失ったあとの人の歩み”' },
  immersion: { id: 'immersion', layer: 'core', label: '未知への没入', essence: '“見たことのない世界に入り込む感覚”' },

  exhilarating: { id: 'exhilarating', layer: 'aftertaste', label: '爽快', essence: '視界が開けるような爽快な読後感' },
  lingering: { id: 'lingering', layer: 'aftertaste', label: '余韻', essence: '読み終えたあとも残る静かな余韻' },
  bitter: { id: 'bitter', layer: 'aftertaste', label: '苦さ', essence: 'すっきりしない苦い後味' },
  warm: { id: 'warm', layer: 'aftertaste', label: '温かさ', essence: '人のつながりが残す温かさ' },
  unsettling: { id: 'unsettling', layer: 'aftertaste', label: 'ざわつき', essence: '心がざわつくような落ち着かなさ' },

  ensemble: { id: 'ensemble', layer: 'style', label: '群像劇', essence: '多くの人物の視点が交わる語り' },
  inner: { id: 'inner', layer: 'style', label: '一人称の内面', essence: '語り手の内面に深く入り込む語り' },
  dialogue: { id: 'dialogue', layer: 'style', label: '会話劇', essence: '会話のやりとりで進む語り' },
  document: { id: 'document', layer: 'style', label: '記録・資料体', essence: '記録や資料を積み重ねる語り' },
  lecture: { id: 'lecture', layer: 'style', label: '知識の講義', essence: '説明を追ううちに理解が深まる語り' },
};

/** メインタイプ（面白さの核）ごとのタイプ名と一言コピー */
export const TYPE_NAMES: Record<CoreTag, { name: string; copy: string }> = {
  mechanism: { name: '仕組みを解く人', copy: 'ルールが見えた瞬間、世界がひっくり返る。' },
  gamesmanship: { name: '駆け引きを楽しむ人', copy: '読み合いの一手に、いちばん心が動く。' },
  reversal: { name: '反転を待つ人', copy: '最後の一行で、全部ひっくり返されたい。' },
  lies: { name: '嘘を見抜く人', copy: '人が隠しているものに、目が向いてしまう。' },
  outsider: { name: 'はみ出し者に寄り添う人', copy: '輪の外にいる人の目で、世界を見たい。' },
  organization: { name: '組織の裏を読む人', copy: '会議室の外で動く力学が、気になって仕方ない。' },
  loss: { name: '喪失を見つめる人', copy: '失ったあとに残るものを、確かめたい。' },
  immersion: { name: '未知に飛び込む人', copy: '見たことのない場所へ、ページごと連れていかれたい。' },
};

/** 読後感（B層）の1位からつく修飾語 */
export const AFTERTASTE_MODIFIERS: Record<AftertasteTag, string> = {
  exhilarating: '爽快に、',
  lingering: '余韻にひたり、',
  bitter: '苦さをかみしめ、',
  warm: '温かさを求め、',
  unsettling: 'ざわつきを楽しみ、',
};
